# Overview
Web app to view Maven dependencies of projects hosted in gitlab.  The dependencies are stored inside a neo4j database.

## data setup flow

* pull_maven_projects

  from gitlab, pul all projects from defined groups. The project definitions are saved in ___config/maven_projects.json___. In addition, the pom files for those projects are fetched and saved in local cache (___./m3/repository/___)

* build_maven_dependencies

  for projects in ___config/maven_projects.json___, resolve their dependencies and save the dependency data in ___dep/___

* neo4j_tool

  load dependencies in ___dep/___ into neo4j