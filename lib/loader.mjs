import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import MavenRepository from './repository.mjs'

const _projectPOMCache = new Map()
const _defaultRepo = new MavenRepository(
  'public',
  'https://repo1.maven.org/maven2',
  true,
  false
)

export default class ProjectPOMLoader {
  constructor(repositories, javaCache = '/Users/155715/.m3/repository') {
    this._repositories = repositories || []
    this._repositories.push(_defaultRepo)
    this._javaCache = javaCache
  }

  async tryLoadFromLocal(mapKey) {
    const [groupId, artifactId, version] = mapKey.split(':')
    const localPath = MavenRepository.getPOMLocalPath({
      groupId,
      artifactId,
      version,
    })
    const localFullPath = `${this._javaCache}/${localPath}`
    if (existsSync(localFullPath)) {
      const projectXml = await readFile(localFullPath, 'utf8')
      return JSON.parse(projectXml)
    }
  }

  async trySaveToLocal(mapKey, project) {
    const [groupId, artifactId, version] = mapKey.split(':')
    const localPath = MavenRepository.getPOMLocalPath({
      groupId,
      artifactId,
      version,
    })
    const localFullPath = `${this._javaCache}/${localPath}`
    if (!existsSync(localFullPath)) {
      const localParentPath = MavenRepository.getPOMLocalParentPath({
        groupId,
        artifactId,
        version,
      })
      await mkdir(`${this._javaCache}/${localParentPath}`, { recursive: true })
      const pomXml = JSON.stringify(project, null, 2)
      await writeFile(localFullPath, pomXml, 'utf8')
    }
  }

  async loadFromCache(mapKey) {
    if (_projectPOMCache.has(mapKey)) {
      return _projectPOMCache.get(mapKey)
    }

    const localCopy = await this.tryLoadFromLocal(mapKey)
    if (localCopy) {
      _projectPOMCache.set(mapKey, localCopy)
    }
    return localCopy
  }

  async saveToCache(mapKey, project) {
    _projectPOMCache.set(mapKey, project)
    await this.trySaveToLocal(mapKey, project)
  }

  async loadProjectPOM(artifact) {
    const signature = artifact.signature()
    const projectPOM = await this.loadFromCache(signature)
    if (projectPOM) {
      return projectPOM
    }

    for await (const repo of this._repositories) {
      const pom = await repo.fetchPOM(artifact)
      if (pom) {
        await this.saveToCache(signature, pom)
        return pom
      }
    }

    throw new Error(`Failed to load ${signature} from any repositories.`)
  }

  extend(customRepos = []) {
    const deduped = customRepos.filter((r) => {
      return this._repositories.every((r2) => r2.baseUrl !== r.baseUrl)
    })

    return new ProjectPOMLoader(
      deduped.concat(this._repositories),
      this._javaCache
    )
  }
}
