import axios from 'axios'
import pomParser from 'pom-parser'
import xml2js from 'xml2js'
import traverse from 'traverse'

axios.defaults.baseURL = process.env.GITLAB_API_ENDPOINT
axios.defaults.headers.common['Private-Token'] = process.env.GITLAB_ACCESS_TOKEN

const defaultGroups = process.env.DEFAULT_PROJECT_GROUPS.split(",")
const maxItems = 1000

const fetchGroups = async () => {
  const url = `/groups?per_page=${maxItems}`
  const groups = await _fetchAll(url, maxItems)
  return groups
}

const fetchProjects = async (group) => {
  const url = `/groups/${group}/projects?per_page=${maxItems}`
  const projects = await _fetchAll(url, maxItems)
  return projects
}

const fetchProject = async (projectId) => {
  const url = `/projects/${projectId}`
  const project = await _fetchAll(url, maxItems)
  return project
}

const fetchMavenProjects = async ({ groups = defaultGroups, projectName }) => {
  const projectsInGroups = await _fetchProjectsFromGroup({
    groups,
    projectName,
  })
  console.info(`Total candidate projects ${projectsInGroups.length}`)
  const projectsWithPOM = await Promise.all(
    projectsInGroups.map(async (project) => {
      const poms = await _parseProjectPOMs(project)
      if (poms && poms.length > 0) {
        project.poms = poms
        const jenkins = await _parseProjectJenkins(project)
        if (jenkins) {
          project.jenkins = jenkins
          return project
        } else {
          console.debug(
            `Skip project ${project.name} b/c it has no jenkins.xml`
          )
        }
      } else {
        console.debug(`Skip project ${project.name} b/c it has no pom.xml`)
      }
      return null
    })
  )
  return projectsWithPOM.filter((p) => !!p)
}

const _fetchProjectsFromGroup = async ({ groups, projectName }) => {
  const projectsInGroups = await Promise.all(
    groups.map(async (group) => {
      const url = `/groups/${group}/projects?per_page=${maxItems}`
      const projects = await _fetchAll(url, maxItems)
      console.info(`Total candidate projects from ${group}: ${projects.length}`)

      return await Promise.all(
        projects.map(async (projectXml) => {
          const {
            id,
            name,
            web_url: webUrl,
            last_activity_at: lastUpdate,
            namespace: { id: groupId, name: groupName },
          } = projectXml

          const idleDays =
            (new Date() - Date.parse(lastUpdate)) / (3600 * 24 * 1000)
          if (projectName && projectName !== name) {
            console.debug(`Skip project ${name} b/c it is not selected`)
            return null
          } else if (name.endsWith('tests')) {
            console.debug(`Skip project ${name} b/c it is a test`)
            return null
          } else if (idleDays > 365) {
            console.debug(
              `Skip project ${name} b/c it has been inactive over an year`
            )
            return null
          }

          const project = { id, name, webUrl, lastUpdate, groupId, groupName }
          const latestRelease = await _getLatestRelease(project)
          if (latestRelease) {
            project.tag = latestRelease
            return project
          } else {
            console.debug(`Skip project ${name} b/c there is no release tag`)
            return null
          }
        })
      )
    })
  )
  return projectsInGroups.flat().filter((p) => !!p)
}

const _fetchAll = async (url, maxRows = 10000) => {
  let page = 1
  let ret = []
  while (page) {
    const { headers, data } = await axios.get(`${url}&page=${page}`)
    ret = [...ret, ...data]
    page = maxRows && ret.length >= maxRows ? null : headers['x-next-page']
  }
  return ret
}

const fetchOne = async (url) => {
  const { data } = await axios.get(url)
  return data
}

const _getLatestRelease = async (project) => {
  const { id, name } = project
  try {
    const url = `/projects/${id}/repository/tags`
    const { data: tags } = await axios.get(url)
    if (tags.length > 0) {
      return tags[0].name
    }
  } catch (err) {
    console.error(`Error processing tags for project ${name}: ${err}`)
    return null
  }
}

const _parseProjectPOMs = async (project) => {
  const { id, name, tag } = project

  try {
    const tagUrl = `/projects/${id}/repository/tree?recursive=true&ref=${encodeURIComponent(
      tag
    )}&per_page=1000`
    const tree = await _fetchAll(tagUrl)
    const pomFiles = tree.filter((f) => f.name === 'pom.xml')
    const poms = await Promise.all(
      pomFiles.map(async (f) => {
        const pomUrl = `/projects/${id}/repository/files/${encodeURIComponent(
          f.path
        )}/raw?ref=${encodeURIComponent(tag)}`
        const { data: pomXml } = await axios.get(pomUrl)
        const pom = await _parsePOM(pomXml)
        pom.url = pomUrl
        const shouldInclude =
          !pom.packaging || ['war', 'jar', 'pom'].includes(pom.packaging)
        return shouldInclude ? pom : null
      })
    )
    return poms.filter((p) => !!p)
  } catch (err) {
    console.error(`Error fetching poms for project ${name}: ${err}`)
  }
}

const _parsePOM = (pomXml) => {
  return new Promise((resolve, reject) => {
    pomParser.parse({ xmlContent: pomXml }, (err, pomResponse) => {
      if (err) {
        reject(err)
      } else {
        const {
          parent,
          groupid,
          artifactid,
          version,
          packaging,
        } = pomResponse.pomObject.project

        const resolvedGroupId = groupid || parent.groupid
        const resolvedVersion = version || parent.version

        resolve({
          groupid: resolvedGroupId,
          artifactid,
          version: resolvedVersion,
          packaging,
        })
      }
    })
  })
}

const _parseProjectJenkins = async (project) => {
  const { id, name, tag } = project
  try {
    const url = `/projects/${id}/repository/files/jenkins%2Exml/raw?ref=${encodeURIComponent(
      tag
    )}`
    const { data: jenkinsXml } = await axios.get(url)
    const jenkins = await _parseJenkins(jenkinsXml)
    return jenkins
  } catch (err) {
    console.error(`Failed to fetch jenkins for project ${name}: ${err}`)
  }
}

const _parseJenkins = (jenkinsXml) => {
  return new Promise((resolve, reject) => {
    xml2js.parseString(jenkinsXml, {}, (err, result) => {
      if (err) {
        reject(err)
      } else {
        const {
          'maven2-moduleset': { jdk, mavenName },
        } = result

        const ret = {
          jdk,
          mavenName,
        }
        _removeSingleArrays(ret)
        resolve(ret)
      }
    })
  })
}

const _removeSingleArrays = (obj) => {
  traverse(obj).forEach(function traversing(value) {
    // As the XML parser returns single fields as arrays.
    if (Array.isArray(value) && value.length === 1) {
      this.update(value[0])
    }
  })
}

export default { fetchGroups, fetchProjects, fetchOne, fetchMavenProjects }
