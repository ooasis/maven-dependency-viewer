import pomParser from 'pom-parser'
import fetch from 'node-fetch'

export default class MavenRepository {
  static parsePOM(pomXml) {
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
            properties,
            dependencymanagement,
            dependencies,
            repositories,
          } = pomResponse.pomObject.project

          const resolvedGroupid = groupid || parent.groupid
          const resolvedVersion = version || parent.version

          resolve({
            parent,
            groupid: resolvedGroupid,
            artifactid,
            version: resolvedVersion,
            properties,
            dependencymanagement,
            dependencies,
            repositories,
          })
        }
      })
    })
  }

  static getPOMLocalParentPath({ groupId, artifactId, version }) {
    const groupPath = groupId.replace(/\./g, '/')
    return `${groupPath}/${artifactId}/${version}`
  }

  static getPOMLocalPath({ groupId, artifactId, version }) {
    const parentPath = MavenRepository.getPOMLocalParentPath({
      groupId,
      artifactId,
      version,
    })
    return `${parentPath}/${artifactId}-${version}.pom`
  }

  static getPOMUrl(baseUrl, { groupId, artifactId, version }) {
    const groupPath = groupId.replace(/\./g, '/')
    return `${baseUrl}/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`
  }

  constructor(name, baseUrl, release, snapshot) {
    this.name = name
    this.baseUrl = baseUrl
    this.release = release
    this.snapshot = snapshot
  }

  _canLoadArtifact(artifact) {
    return artifact.isSnapshot() ? this.snapshot : this.release
  }

  async fetchPOM(artifact) {
    if (this._canLoadArtifact(artifact)) {
      try {
        const pomUrl = MavenRepository.getPOMUrl(this.baseUrl, artifact)
        // console.info(`Searching pom from repository ${this.name}: ${pomUrl}`)
        const resp = await fetch(pomUrl)
        const pom = await resp.text()
        // console.info(`Found pom from repository ${this.name}: ${pomUrl}`)
        // console.info(`Loaded artifact: ${artifact.keyWithVersion()}`)
        return await MavenRepository.parsePOM(pom)
      } catch (err) {
        // console.debug(`No pom found due to ${err}. Continue to next repo`)
      }
    }
  }
}
