<template>
  <v-container>
    <v-row>
      <v-col cols="3">
        <v-select
          v-model="selectedGroup"
          :items="groups"
          item-text="name"
          return-object
          dense
          label="Choose a group"
          @change="selectProjects"
        ></v-select>
      </v-col>
      <v-col cols="4">
        <v-select
          v-model="selectedProject"
          :items="projects"
          item-text="name"
          return-object
          dense
          label="Choose a project"
        ></v-select>
      </v-col>
      <v-col cols="2">
        <v-btn color="accent-4" :disabled="!selectedProject" @click="analyze">
          Analyze
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>
<script>
import axios from 'axios'

export default {
  async fetch() {
    const { data: groups } = await axios.get('/api/gitlab/groups')
    this.groups = groups
  },
  fetchOnServer: false,
  data() {
    return {
      groups: [],
      projects: [],
      artifacts: [],
      selectedGroup: null,
      selectedProject: null,
    }
  },
  methods: {
    async selectProjects() {
      this.projects = []
      this.selectedProject = null
      const { data: projects } = await axios.get(
        `/api/gitlab/projects?group=${this.selectedGroup.name}`
      )
      this.projects = projects
    },
    analyze() {},
  },
}
</script>
