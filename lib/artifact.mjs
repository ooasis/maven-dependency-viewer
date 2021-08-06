export default class Artifact {
  static fromStr(str) {
    const [groupId, artifactId, version] = str.split(':')
    return new Artifact(groupId, artifactId, version)
  }

  static artifactKey(groupid, artifactid) {
    return `${groupid}:${artifactid}`
  }

  constructor(groupId, artifactId, version, scope = 'compiler') {
    this.groupId = groupId
    this.artifactId = artifactId
    this.version = version
    this.scope = scope
    this._ensureValid()
  }

  isSnapshot() {
    return this.version.endsWith('-SNAPSHOT')
  }

  key() {
    return `${this.groupId}:${this.artifactId}`
  }

  signature() {
    return `${this.groupId}:${this.artifactId}:${this.version}`
  }

  signature2() {
    return `${this.groupId}:${this.artifactId}:jar:${this.version}:${this.scope}`
  }

  isSameAs(other) {
    return other && this.signature() === other.signature()
  }

  _ensureValid() {
    if (!(this.groupId && this.artifactId)) {
      throw new Error(`Invalid artifact: ${this.signature()}`)
    }
  }
}
