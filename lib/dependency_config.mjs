import { ensureArray } from './util.mjs'
import Artifact from './artifact.mjs'

export default class DependencyConfig {
  static fromPOM(version, scope, exclusions) {
    let exclusionSet
    if (exclusions && exclusions.exclusion) {
      exclusionSet = new Set(
        ensureArray(exclusions.exclusion).map((exclusion) => {
          return Artifact.artifactKey(exclusion.groupid, exclusion.artifactid)
        })
      )
    }
    return new DependencyConfig(version, scope, exclusionSet)
  }

  constructor(version, scope, exclusionSet) {
    this.version = version
    this.scope = scope
    this.exclusionSet = exclusionSet
  }
}
