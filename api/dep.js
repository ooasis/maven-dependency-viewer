import fs from 'fs/promises'
import { DependencyNode } from '../lib/dep_tree.mjs'

export default async function (req, res, next) {
  // const node_str = await fs.readFile('tmp/node_test_tree.txt', 'utf8')
  // const node_tree = DependencyNode.fromStr(node_str.split('\n'))

  // const java_str = await fs.readFile('tmp/java_test_tree.txt', 'utf8')
  // const java_tree = DependencyNode.fromStr(java_str.split('\n'))
  // const root = new DependencyNodeDiff(java_tree, node_tree)

  const internalStr = await fs.readFile('tmp/internal_tree.txt', 'utf8')
  const internalTree = DependencyNode.fromStr(internalStr.split('\n'))

  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(internalTree))
}
