/* eslint-disable no-multi-str */
import url from 'url'
import neo4j from 'neo4j-driver'

const projectsQuery = (filter) => {
  if (filter) {
    return `MATCH (p:Project) WHERE p.name = '${filter}' RETURN p`
  } else {
    return `MATCH (p:Project) RETURN p`
  }
}

const artifactsQuery = (project) => {
  if (project) {
    return `MATCH (a:Artifact) WHERE a.project = '${project}' RETURN a`
  } else {
    return `MATCH (a:Artifact) RETURN a`
  }
}

const projectDepUpstreamQuery = (projectName) => {
  return `MATCH p = (a:Project)<-[:USES*]-(:Project) 
  WHERE a.name = '${projectName}'
  RETURN relationships(p) as p, nodes(p) as n`
}

const projectDepDownstreamQuery = (projectName) => {
  return `MATCH p = (a:Project)-[:USES*]->(:Project) 
  WHERE a.name = '${projectName}'
  RETURN relationships(p), nodes(p)`
}

const artifactDepUpstreamQuery = (groupId, artifactId) => {
  return `MATCH p = (a:Artifact)<-[:DEPENDS*]-(:Artifact) 
  WHERE a.groupId = '${groupId}' and a.artifactId = '${artifactId}'
  RETURN relationships(p), nodes(p)`
}

const artifactDepDownstreamQuery = (groupId, artifactId) => {
  return `MATCH p = (a:Artifact)-[:DEPENDS*]->(:Artifact) 
  WHERE a.groupId = '${groupId}' and a.artifactId = '${artifactId}'
  RETURN relationships(p), nodes(p)`
}

const extractRelationshipFromPath = (p) => {
  const relationships = p._fields[p._fieldLookup.p]

  const fields = p._fields[p._fieldLookup.n]
  if (fields) {
    const nodes = new Map(
      p._fields[p._fieldLookup.n].map((n) => [
        n.identity.low,
        n.properties.name,
      ])
    )
    return relationships.map((relationship) => {
      const start = nodes.get(relationship.start.low)
      const end = nodes.get(relationship.end.low)
      return { start, end }
    })
  } else {
    return []
  }
}

const ensureNode = (name, nodeMap) => {
  if (!nodeMap.has(name)) {
    nodeMap.set(name, {
      name,
      children: [],
    })
  }

  return nodeMap.get(name)
}

const queryRelationships = async (q, v) => {
  const processor = new Neo4JProcessor()
  const records = await processor.runQuery(q)

  let relationships = []
  for (const p of records) {
    relationships = [...relationships, ...extractRelationshipFromPath(p)]
  }

  const nodeMap = new Map()
  for (const relationship of relationships) {
    const { start, end } = relationship
    const startNode = ensureNode(start, nodeMap)
    const endNode = ensureNode(end, nodeMap)
    endNode.children.push(startNode)
  }

  return nodeMap.get(v)
}

const queryNodes = async (q, v) => {
  const processor = new Neo4JProcessor()
  const records = await processor.runQuery(q)
  return records.map((r) => r._fields[r._fieldLookup.p].properties.name)
}

class Neo4JProcessor {
  constructor(url, user, passwd) {
    this.url = process.env.NEO4J_URL
    this.user = process.env.NEO4J_USER
    this.password = process.env.NEO4J_PASS
  }

  async runQuery(q) {
    const driver = neo4j.driver(
      this.url,
      neo4j.auth.basic(this.user, this.password)
    )
    const session = driver.session({
      defaultAccessMode: neo4j.session.WRITE,
    })

    try {
      const { records } = await session.run(q)
      await session.close()
      return records
    } catch (err) {
      console.error(`Neo4J query failed: ${err}`)
    } finally {
      await driver.close()
    }
  }
}

export default async function (req, res, next) {
  /* eslint-disable node/no-deprecated-api */
  const { t, v } = url.parse(req.url, true).query

  let result
  if (t === 'projectupstream') {
    result = await queryRelationships(projectDepUpstreamQuery(v), v)
  } else if (t === 'projectdownstream') {
    result = await queryRelationships(projectDepDownstreamQuery(v), v)
  } else if (t === 'artifactupstream') {
    result = await queryRelationships(artifactDepUpstreamQuery(v), v)
  } else if (t === 'artifactdownstream') {
    result = await queryRelationships(artifactDepDownstreamQuery(v), v)
  } else if (t === 'projects') {
    result = await queryNodes(projectsQuery(v), v)
  } else if (t === 'artifacts') {
    result = await queryNodes(artifactsQuery(v), v)
  }

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(result))
}
