import { readFile } from 'fs/promises'
import Artifact from '../lib/artifact.mjs'
import gl from '../lib/gl.mjs'
import ArtifactLoader from '../lib/loader.mjs'
import Project from '../lib/project.mjs'
import MavenRepository from '../lib/repository.mjs'

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
    const dependencies = []
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
    console.log(`Processed project ${mavenProject.name}`)
  }
})()
