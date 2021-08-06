const top = (stack) => {
  return stack[stack.length - 1]
}

class DependencyNode {
  constructor(groupId, artifactId, version, typ, scope, pos, children = []) {
    this.groupId = groupId
    this.artifactId = artifactId
    this.version = version
    this.typ = typ
    this.scope = scope
    this.pos = pos
    this.children = children
  }

  static fromStr(treeAsStrAry) {
    let root
    const stack = []
    for (const line of treeAsStrAry) {
      const m = line.match(/([^:\s]+):([^:]+):([^:]+):([^:]+)(?::([^:]+))?$/)
      if (m) {
        // eslint-disable-next-line no-unused-vars
        const [_, groupId, artifactId, typ, version, scope] = m
        const pos = line.indexOf(groupId)
        const node = new DependencyNode(
          groupId,
          artifactId,
          version,
          typ,
          scope,
          pos
        )
        if (!root) {
          root = node
          stack.push(node)
          continue
        }

        while (true) {
          if (top(stack).compareLevel(node) === -1) {
            top(stack).addChild(node)
            stack.push(node)
            break
          }
          stack.pop()
        }
      }
    }
    return root
  }

  key() {
    return `${this.groupId}:${this.artifactId}`
  }

  signature() {
    return `${this.groupId}:${this.artifactId}:${this.version}`
  }

  compareLevel(other) {
    return Math.sign(this.pos - other.pos)
  }

  addChild(child) {
    this.children.push(child)
  }

  sameArtifact(other) {
    return (
      this.groupId === other.groupId && this.artifactId === other.artifactId
    )
  }

  sameAs(other) {
    return (
      this.groupId === other.groupId &&
      this.artifactId === other.artifactId &&
      this.version === other.version
    )
  }
}

class DependencyNodeDiff extends DependencyNode {
  static onlyInOneSide(me, other) {
    return me.children.filter(
      (c) => !other.children.some((o) => o.sameArtifact(c))
    )
  }

  constructor(left, right) {
    super()
    if (left && right && !left.sameArtifact(right)) {
      throw new Error(`Root is different ${left.key()} vs ${right.key()}`)
    }

    this.groupId = (left || right).groupId
    this.artifactId = (left || right).artifactId

    if (left && right) {
      this.mode = left.version === right.version ? 'same' : 'conflict'
      this.versions = [left.version, right.version]

      const onlyInLeft = DependencyNodeDiff.onlyInOneSide(left, right)
      onlyInLeft.forEach((c) => {
        this.children.push(new DependencyNodeDiff(c, null))
      })

      const onlyInRight = DependencyNodeDiff.onlyInOneSide(right, left)
      onlyInRight.forEach((c) => {
        this.children.push(new DependencyNodeDiff(null, c))
      })

      left.children.forEach((lc) => {
        right.children.forEach((rc) => {
          if (lc.sameArtifact(rc)) {
            this.children.push(new DependencyNodeDiff(lc, rc))
          }
        })
      })
    } else if (left) {
      this.mode = 'left'
      this.versions = [left.version]
      left.children.forEach((c) => {
        this.children.push(new DependencyNodeDiff(c, null))
      })
    } else if (right) {
      this.mode = 'right'
      this.versions = [right.version]
      right.children.forEach((c) => {
        this.children.push(new DependencyNodeDiff(null, c))
      })
    }
  }
}

export { DependencyNode, DependencyNodeDiff }
