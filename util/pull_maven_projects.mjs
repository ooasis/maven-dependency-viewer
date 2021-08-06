import { writeFile } from 'fs/promises'
import MavenRepository from '../lib/repository.mjs'
import ArtifactLoader from '../lib/loader.mjs'
import gl from '../lib/gl.mjs'
;(async () => {
  const loader = new ArtifactLoader()

  const projects = await gl.fetchMavenProjects({
  })
  console.log(`Pulled ${projects.length} projects with pom`)

  await writeFile(
    'config/maven_projects.json',
    JSON.stringify(projects, null, 2),
    'utf8'
  )

  for (const project of projects) {
    console.log(`Fetching POM for project ${project.name}`)
    for (const pom of project.poms) {
      try {
        const pomXml = await gl.fetchOne(pom.url)
        const pomProject = await MavenRepository.parsePOM(pomXml)
        await loader.trySaveToLocal(
          `${pom.groupid}:${pom.artifactid}:${pom.version}`,
          pomProject
        )
        console.log(`POM saved for project ${project.name}`)
      } catch (err) {
        console.error(`Cannot fetch POM for project ${project.name}: ${err}`)
      }
    }
    // break
  }
})().catch((err) => console.error(err))
