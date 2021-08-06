import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import MavenRepository from '../lib/repository.mjs'
import ArtifactLoader from '../lib/loader.mjs'
import Artifact from '../lib/artifact.mjs'
import Project from '../lib/project.mjs'
import gl from '../lib/gl.mjs'


const isInternalPackage = (groupId, internalPackages) => {
  for (internalPackage of internalPackages ) {
    if (groupId.indexOf(internalPackage) > 0) {
      return true
    }
  }
  return false
}

const isInternal = ({ groupid: groupId, version }) => {
  const internalPackages = process.env.INTERNAL_PACKAGES.split(",")
  return (
    isInternalPackage(groupId, internalPackages) &&
    !(version && version.toLowerCase().indexOf('snapshot')) > 0
  )
}

const internalRelease = new MavenRepository(
  'internalRelease',
  process.env.INTERNAL_MAVEN_REPO,
  true,
  false
)

const loader = new ArtifactLoader([internalRelease])

;(async () => {
  const s = await readFile('config/maven_projects.json', 'utf8')
  const mavenProjects = JSON.parse(s)
  for (const mavenProject of mavenProjects) {
    console.log(`Processing project ${mavenProject.name}`)
    const depFile = `dep/${mavenProject.name}.json`
    if (existsSync(depFile)) {
      console.info(
        `Skip dependency analysis b/c the file already exists: ${depFile}`
      )
      continue
    }

    const dependencies = []
    try {
      for (const pom of mavenProject.poms) {
        const artifact = Artifact.fromStr(
          `${pom.groupid}:${pom.artifactid}:${pom.version}`
        )
        const project = new Project(artifact, loader)

        const pomXml = await gl.fetchOne(pom.url)
        await project.ensureLoaded(pomXml)
        await project.resolveDependencies(isInternal)
        const depTree = project.treeAsJson()

        if (depTree.children && depTree.children.length > 0) {
          dependencies.push(depTree)
        }
      }
      if (dependencies.length > 0) {
        mavenProject.dependencies = dependencies
      }
      await writeFile(
        `dep/${mavenProject.name}.json`,
        JSON.stringify(mavenProject, null, 2)
      )
      console.log(`Processed project ${mavenProject.name}`)
    } catch (err) {
      console.error(`Failed to process project ${mavenProject.name}: ${err}`)
      const isSnapshotIssue = `${err}`.match(
        /^Error: Failed to load .+ from any repositories.$/
      )
      if (isSnapshotIssue) {
        mavenProject.error = 'snapshot not removed'
        await writeFile(
          `dep/${mavenProject.name}.json`,
          JSON.stringify(mavenProject, null, 2)
        )
      }
    }
  }
})().catch((err) => console.error(err))
