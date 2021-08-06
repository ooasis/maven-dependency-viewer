/* eslint-disable no-multi-str */
import neo4j from 'neo4j-driver'

const insertArtifactQuery =
  'UNWIND $pairs as pair \
   MERGE (a1:Artifact {groupId:pair[0].groupId, artifactId:pair[0].artifactId, version:pair[0].version, project:pair[0].project}) \
   MERGE (a2:Artifact {groupId:pair[1].groupId, artifactId:pair[1].artifactId, version:pair[1].version, project:pair[1].project}) \
   MERGE (a1)-[:DEPENDS]-(a2)'

const clearProjectQuery = 'MATCH (a:Project) DETACH DELETE a'

const insertProjectQuery =
  'UNWIND $pairs as pair \
    MERGE (a1:Project {name:pair[0]}) \
    MERGE (a2:Project {name:pair[1]}) \
    MERGE (a1)-[:USES]-(a2)'

class Neo4JRepository {
  constructor(url, user, passwd) {
    this.driver = neo4j.driver(url, neo4j.auth.basic(user, passwd))
  }

  async uploadArtifacts(dependencies) {
    const session = this.driver.session({
      defaultAccessMode: neo4j.session.WRITE,
    })

    await session.run(insertArtifactQuery, { pairs: dependencies })
    await session.close()
  }

  async uploadProjects(dependencies) {
    const session = this.driver.session({
      defaultAccessMode: neo4j.session.WRITE,
    })

    await session.run(clearProjectQuery)
    await session.run(insertProjectQuery, { pairs: dependencies })
    await session.close()
  }
}

export { Neo4JRepository }
