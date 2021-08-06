import { createLog, ensureArray } from './util.mjs'
import Artifact from './artifact.mjs'
import MavenRepository from './repository.mjs'
import DependencyConfig from './dependency_config.mjs'
import { DependencyNode } from './dep_tree.mjs'

// artifact_key -> Project
const resolvedDependencies = new Map()

const log = createLog('project')

const extractPlaceholder = (val) => {
  if (val) {
    const m = val.match(/^\$\{([^}]+)\}$/)
    return m ? m[1] : null
  } else {
    // we want to return null for downstream
    return null
  }
}

const acceptAll = () => true

// TODO
// 1. include dependencies inside  projectPOM.profile.dependencies ??
export default class Project {
  static async getProject(
    artifact,
    bootstrapLoader,
    level,
    upstream,
    exclusionSet
  ) {
    const project = new Project(
      artifact,
      bootstrapLoader,
      level,
      upstream,
      exclusionSet
    )
    await project.ensureLoaded()
    return project
  }

  constructor(
    artifact,
    bootstrapLoader,
    level = 0,
    upstream = null,
    exclusionSet = new Set()
  ) {
    this.artifact = artifact
    this._bootstrapLoader = bootstrapLoader
    this._exclusionSet = exclusionSet
    this._level = level
    this._upstream = upstream
  }

  treeAsJson(depth = 0, reported = new Set()) {
    const dependenciesToReport = this._dependencies.filter((depProject) => {
      // depProject.artifact._alt_version means it has been replaced by another dependency
      // !depProject._dependencies means it has not been resolved
      return (
        !reported.has(depProject.artifact.key()) &&
        !depProject.artifact._alt_version &&
        depProject._dependencies
      )
    })

    dependenciesToReport.forEach((depProject) => {
      reported.add(depProject.artifact.key())
    })

    const depTree = dependenciesToReport.map((depProject) => {
      return depProject.treeAsJson(depth + 1, reported)
    })

    return new DependencyNode(
      this.artifact.groupId,
      this.artifact.artifactId,
      this.artifact.version,
      null,
      this.artifact.scope,
      0,
      depTree
    )
  }

  tree(depth = 0, reported = new Set()) {
    let depTreeStr = ''
    if (this._dependencies) {
      const dependenciesToReport = this._dependencies.filter((depProject) => {
        // depProject.artifact._alt_version means it has been replaced by another dependency
        // !depProject._dependencies means it has not been resolved
        return (
          !reported.has(depProject.artifact.key()) &&
          !depProject.artifact._alt_version &&
          depProject._dependencies
        )
      })

      dependenciesToReport.forEach((depProject) => {
        reported.add(depProject.artifact.key())
      })
      const depTree = dependenciesToReport.map((depProject) => {
        return `${depProject.tree(depth + 1, reported)}`
      })
      depTreeStr = depTree.length > 0 ? `\n${depTree.join('\n')}` : ''
    }

    return `${'  '.repeat(depth)}${
      depth > 0 ? '|-' : '*'
    } ${this.artifact.signature2()}${depTreeStr}`
  }

  // resolve dependencies, this is the meat of this implementation
  async resolveDependencies(artifactFilter) {
    let dependencyCandidates = await this._getDependencyCandidates(
      artifactFilter
    )
    let newDependencyCandidates
    let level = 1
    while (dependencyCandidates.length > 0) {
      newDependencyCandidates = []
      for (const candidate of dependencyCandidates) {
        const key = candidate.artifact.key()
        let resolvedDependency = resolvedDependencies.get(key)
        if (
          resolvedDependency &&
          resolvedDependency._level <= candidate._level
        ) {
          // we already have a dependency resolved, so we will stop here
          candidate._alt_level = resolvedDependency._level
          candidate.artifact._alt_version = resolvedDependency.artifact.version
        } else {
          try {
            // mark it as being replaced
            if (resolvedDependency) {
              resolvedDependency._alt_level = candidate._level
              resolvedDependency.artifact._alt_version =
                candidate.artifact.version
            }
            resolvedDependencies.set(key, candidate)

            const newCandidates = await candidate._getDependencyCandidates(
              artifactFilter
            )
            for (const newCandidate of newCandidates) {
              resolvedDependency = resolvedDependencies.get(
                newCandidate.artifact.key()
              )
              if (
                !(
                  resolvedDependency &&
                  resolvedDependency._level <= newCandidate._level
                )
              ) {
                newDependencyCandidates.push(newCandidate)
              }
            }
          } catch (err) {
            console.error(`Failed to fetch dependency: ${key}: ${err}`)
            candidate.artifact.err = err
            resolvedDependencies.set(key, 'failed')
          }
        }
      }
      console.info(
        `Resolved level ${level}: resolved: ${dependencyCandidates.length}, total_resolved: ${resolvedDependencies.size}, new candidates: ${newDependencyCandidates.length}`
      )
      level += 1
      dependencyCandidates = newDependencyCandidates
    }
  }

  async _getDependencyCandidates(filter) {
    this._dependencies = []

    const artifactFilter = filter || acceptAll
    const candidates = this._rawDependencies
      .filter(artifactFilter)
      .filter((artifact) => {
        return !['test', 'provided', 'system'].includes(artifact.scope)
      })
      .filter((artifact) => {
        return !(artifact.optional && artifact.optional === 'true')
      })

    for (const candidate of candidates) {
      // eslint-disable-next-line prefer-const
      let { groupid, artifactid, version, scope, exclusions } = candidate
      groupid = this._resolvePlaceholder(groupid)
      artifactid = this._resolvePlaceholder(artifactid)
      const key = Artifact.artifactKey(groupid, artifactid)

      if (this._isExcluded(key)) {
        continue
      }

      const artifactConfig = this._dependencyManagement.get(key)
      if (!version && !artifactConfig) {
        console.error(`No version resolved for dependency ${key}`)
        continue
      }

      if (
        artifactConfig &&
        ['test', 'provided', 'system'].includes(artifactConfig.scope)
      ) {
        continue
      }

      version = this._resolvePlaceholder(version || artifactConfig.version)

      let exclusionSet = new Set()
      if (exclusions && exclusions.exclusion) {
        exclusionSet = new Set(
          ensureArray(exclusions.exclusion).map((exclusion) => {
            return Artifact.artifactKey(exclusion.groupid, exclusion.artifactid)
          })
        )
      }

      if (artifactConfig && artifactConfig.exclusionSet) {
        exclusionSet = new Set([
          ...exclusionSet,
          ...artifactConfig.exclusionSet,
        ])
      }

      const depArtifact = new Artifact(groupid, artifactid, version, scope)

      if (!this._isInUpstream(depArtifact)) {
        try {
          const depProject = await Project.getProject(
            depArtifact,
            this._loader,
            this._level + 1,
            this,
            exclusionSet
          )
          this._dependencies.push(depProject)
        } catch (err) {
          // we will continue with rest of the dependencies
          console.error(`Failed to load dependency: ${err}`)
        }
      } else {
        console.warn(
          `Detected cyclic dependency for fetch dependency ${depArtifact.signature()}:  ${this._upstreams().join(
            ' -> '
          )}`
        )
      }
    }

    return this._dependencies
  }

  _isExcluded(artifactKey) {
    if (this._exclusionSet.has(artifactKey)) {
      return true
    }

    if (this._upstream) {
      return this._upstream._isExcluded(artifactKey)
    }

    return false
  }

  // load everything (mainly config) except for real dependencies
  async ensureLoaded(pomXml) {
    try {
      const projectPOM = pomXml
        ? await MavenRepository.parsePOM(pomXml)
        : await this._bootstrapLoader.loadProjectPOM(this.artifact)

      this._properties = new Map()
      this._dependencyManagement = new Map()
      this._rawDependencies = []

      // prepare the loader to load other artifacts
      this._ensureLoader(projectPOM, this._bootstrapLoader)
      this._ensureProperties(projectPOM)
      await this._ensureParent(projectPOM)
      await this._ensureDependencyManagement(projectPOM)
      this._ensureDependencies(projectPOM)
    } catch (err) {
      log.error(`Failed to load project: ${this.artifact.signature()}`)
      throw err
    }
  }

  // create the loader that can be used to load other POMs defined in this POM
  _ensureLoader(projectPOM, bootstrapLoader) {
    if (projectPOM.repositories && projectPOM.repositories.repository) {
      const customRepos = ensureArray(projectPOM.repositories.repository).map(
        (r) => {
          const release =
            r.releases && typeof r.releases === 'object' && r.releases.enabled
              ? r.releases.enabled !== 'false'
              : true
          const snapshot =
            r.snapshots &&
            typeof r.snapshots === 'object' &&
            r.snapshots.enabled
              ? r.snapshots.enabled !== 'false'
              : true
          return new MavenRepository(r.id, r.url, release, snapshot)
        }
      )
      this._loader = bootstrapLoader.extend(customRepos)
    } else {
      this._loader = bootstrapLoader
    }
  }

  _ensureProperties(projectPOM) {
    if (projectPOM.properties) {
      this._properties = new Map(Object.entries(projectPOM.properties))
    }

    // place some defaults
    this._properties.set('project.groupid', this.artifact.groupId)
    this._properties.set('pom.groupid', this.artifact.groupId)
    this._properties.set('project.artifact', this.artifact.artifactId)
    this._properties.set('pom.artifact', this.artifact.artifactId)
    this._properties.set('project.version', this.artifact.version)
    this._properties.set('pom.version', this.artifact.version)
  }

  async _ensureParent(projectPOM) {
    if (projectPOM.parent) {
      const { groupid, artifactid, version } = projectPOM.parent
      const parentArtifact = new Artifact(
        this._resolvePlaceholder(groupid),
        this._resolvePlaceholder(artifactid),
        this._resolvePlaceholder(version)
      )

      const sameInUpstream = this._isInUpstream(parentArtifact)
      if (!sameInUpstream) {
        try {
          const parent = await Project.getProject(
            parentArtifact,
            this._loader,
            this._level,
            this
          )

          // merge props and configs
          this._properties = new Map([
            ...parent._properties,
            ...this._properties,
          ])
          this._dependencyManagement = this._mergeDependencyManagements(
            parent._dependencyManagement,
            this._dependencyManagement
          )
          this._rawDependencies = [
            ...parent._rawDependencies,
            ...this._rawDependencies,
          ]
        } catch (err) {
          // we will continue with rest of the parsing
          console.error(`Failed to load parent: ${err}`)
        }
      } else {
        this._properties = new Map([
          ...sameInUpstream._properties,
          ...this._properties,
        ])

        this._dependencyManagement = this._mergeDependencyManagements(
          sameInUpstream._dependencyManagement,
          this._dependencyManagement
        )
        this._rawDependencies = [
          ...sameInUpstream._rawDependencies,
          ...this._rawDependencies,
        ]

        // console.warn(
        //   `Detected cyclic dependency for fetch parent ${parentArtifact.signature()}:  ${this._upstreams().join(
        //     ' -> '
        //   )}`
        // )
      }
    }
  }

  _upstreams() {
    if (this._upstream) {
      return [...this._upstream._upstreams(), this.artifact.signature()]
    } else {
      return [this.artifact.signature()]
    }
  }

  _isInUpstream(artifact) {
    if (this._upstream) {
      if (this._upstream.artifact.isSameAs(artifact)) {
        return this._upstream
      } else {
        return this._upstream._isInUpstream(artifact)
      }
    }
    return null
  }

  _mergeDependencyManagements(m1, m2) {
    for (const [key, value] of m2.entries()) {
      if (m1.has(key)) {
        m1.set(key, this._mergeDependencyConfig(m1.get(key), value))
      } else {
        m1.set(key, value)
      }
    }
    return m1
  }

  _mergeDependencyConfig(dc1, dc2) {
    // TBD: which version ?
    const version = dc1.version || dc2.version
    let exclusionSet
    if (dc1.exclusionSet) {
      if (dc2.exclusionSet) {
        // TODO: not clear
        // exclusionSet = new Set([...dc1.exclusionSet, ...dc2.exclusionSet])
        exclusionSet = dc2.exclusionSet
      } else {
        exclusionSet = dc1.exclusionSet
      }
    } else {
      exclusionSet = dc2.exclusionSet
    }

    return new DependencyConfig(version, exclusionSet)
  }

  async _ensureDependencyManagement(projectPOM) {
    if (
      projectPOM.dependencymanagement &&
      projectPOM.dependencymanagement.dependencies &&
      projectPOM.dependencymanagement.dependencies.dependency
    ) {
      const dependencyConfigs = ensureArray(
        projectPOM.dependencymanagement.dependencies.dependency
      )

      const imports = dependencyConfigs.filter((d) => {
        const { type, scope } = d
        return scope === 'import' || type === 'pom'
      })

      const regular = dependencyConfigs.filter((d) => {
        const { type, scope } = d
        return !(scope === 'import' || type === 'pom')
      })

      for (const dependencyConfig of imports) {
        const { groupid, artifactid, version } = dependencyConfig
        const configArtifact = new Artifact(
          this._resolvePlaceholder(groupid),
          this._resolvePlaceholder(artifactid),
          this._resolvePlaceholder(version)
        )
        const sameInUpstream = this._isInUpstream(configArtifact)
        if (!sameInUpstream) {
          try {
            const importedProject = await Project.getProject(
              configArtifact,
              this._loader,
              this._level,
              this
            )

            this._properties = new Map([
              ...importedProject._properties,
              ...this._properties,
            ])
            this._dependencyManagement = this._mergeDependencyManagements(
              importedProject._dependencyManagement,
              this._dependencyManagement
            )
          } catch (err) {
            // we will continue with rest of the config
            console.error(`Failed to load dependency config: ${err}`)
          }
        } else {
          this._properties = new Map([
            ...sameInUpstream._properties,
            ...this._properties,
          ])
          this._dependencyManagement = this._mergeDependencyManagements(
            sameInUpstream._dependencyManagement,
            this._dependencyManagement
          )
          // stop cyclyic dependecies
          // console.warn(
          //   `Detected cyclic dependency for import config ${configArtifact.signature()}:  ${this._upstreams().join(
          //     ' -> '
          //   )}`
          // )
        }
      }

      for (const dependencyConfig of regular) {
        const {
          groupid,
          artifactid,
          version,
          scope,
          exclusions,
        } = dependencyConfig

        const configArtifact = new Artifact(
          this._resolvePlaceholder(groupid),
          this._resolvePlaceholder(artifactid),
          this._resolvePlaceholder(version),
          scope
        )
        const key = configArtifact.key()
        this._dependencyManagement.set(
          key,
          DependencyConfig.fromPOM(configArtifact.version, scope, exclusions)
        )
      }
    }
  }

  _ensureDependencies(projectPOM) {
    if (projectPOM.dependencies && projectPOM.dependencies.dependency) {
      this._rawDependencies = [
        ...this._rawDependencies,
        ...ensureArray(projectPOM.dependencies.dependency),
      ]
    }
  }

  _resolvePlaceholder(val) {
    const placeholder = extractPlaceholder(val)
    if (placeholder) {
      // convert to lowercase b/c the key has been lowercased when loaded into memory
      let resolved = this._properties.get(placeholder.toLowerCase())
      if (resolved) {
        // sometimes, the property value is an array due to json parsing
        if (Array.isArray(resolved)) {
          resolved = resolved.length > 0 ? resolved[0] : null
        }
        // in case the resolve the value is placeholder again
        return this._resolvePlaceholder(resolved)
      } else {
        console.warn(`Failed to resolve ${val}`)
        return val
      }
    } else {
      return val
    }
  }
}
