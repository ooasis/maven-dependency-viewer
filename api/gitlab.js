/* eslint-disable no-console */
/* eslint-disable node/no-deprecated-api */
import url from 'url'
import gl from '../lib/gl.mjs'

const getGroups = async (urlParsed) => {
  const groups = await gl.fetchGroups()
  return groups.map((g) => {
    return {
      id: g.id,
      name: g.name,
      description: g.description,
    }
  })
}

const getProjects = async (urlParsed) => {
  const { group } = urlParsed.query
  const projects = await gl.fetchProjects(group)
  return projects.map((p) => {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
    }
  })
}

const handlers = {
  '/groups': getGroups,
  '/projects': getProjects,
}

export default async function (req, res, next) {
  let resp = null
  const urlParsed = url.parse(req.url, true)

  const handler = handlers[urlParsed.pathname]
  if (handler) {
    try {
      resp = await handler(urlParsed)
    } catch (err) {
      res.statusCode = 500
      console.error(`Failed to process ${urlParsed.pathname}: ${err}`)
      resp = { error: `${err}` }
    }
  } else {
    res.statusCode = 404
    resp = { error: `Invalid path ${urlParsed.pathname}` }
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(resp))
}
