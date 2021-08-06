import fs from 'fs/promises'
import { Neo4JRepository } from '../lib/neo4j.mjs'

const artifactProjectMap = new Map()
const projectDependencies = []

const signature = (artifact) => {
  return `${artifact.groupId}:${artifact.artifactId}`
}

const getProject = (name) => {
  return artifactProjectMap.get(name)
}

const prepareProjectDependenciesData = (dependency) => {
  const dependencyProject = getProject(signature(dependency))
  if (dependency.children && dependency.children.length > 0) {
    for (const child of dependency.children) {
      const childProject = getProject(signature(child))
      if (childProject) {
        if (dependencyProject !== childProject) {
          projectDependencies.push([dependencyProject, childProject])
        }
        prepareProjectDependenciesData(child)
      } else {
        console.warn(
          `Dependency ${signature(child)} cannot be mapped to project`
        )
      }
    }
  } else {
    console.warn(`Dependency ${signature(dependency)} has no children`)
  }
}

;(async () => {
  const repo = new Neo4JRepository(
    process.env.NEO4J_URL, process.env.NEO4J_USER, process.env.NEO4J_PASS)

  let dir = await fs.opendir('dep')
  for await (const dirent of dir) {
    const projectJson = await fs.readFile(`dep/${dirent.name}`, 'utf8')
    const project = JSON.parse(projectJson)
    if (project.poms) {
      for (const pom of project.poms) {
        artifactProjectMap.set(`${pom.groupid}:${pom.artifactid}`, project.name)
      }
    }
  }

  dir = await fs.opendir('dep')
  for await (const dirent of dir) {
    const projectJson = await fs.readFile(`dep/${dirent.name}`, 'utf8')
    const project = JSON.parse(projectJson)
    console.info(`Processing project: ${project.name}`)
    if (project.dependencies) {
      for (const dependency of project.dependencies) {
        const dependencyProject = getProject(signature(dependency))
        if (dependencyProject) {
          if (project.name !== dependencyProject) {
            projectDependencies.push([project.name, dependencyProject])
          }
          prepareProjectDependenciesData(dependency)
        } else {
          console.warn(`Dependency has no project: ${signature(dependency)}`)
        }
      }
    } else {
      console.warn(`Project ${project.name} has no dependencies`)
    }
  }

  console.info(`Total relationships: ${projectDependencies.length}`)
  await repo.uploadProjects(projectDependencies)
})()
