<template>
  <v-container>
    <v-row>
      <v-col cols="3">
        <v-select
          v-model="selectedMode"
          :items="availableModes"
          dense
          label="Choose a mode"
        ></v-select>
      </v-col>
      <v-col cols="4">
        <v-select
          v-model="selectedProject"
          :items="projects"
          dense
          label="Choose a project"
        ></v-select>
      </v-col>
      <v-col cols="2">
        <v-btn
          color="deep-purple accent-4"
          :disabled="!selectedProject"
          @click="loadTree"
        >
          Load Tree
        </v-btn>
      </v-col>
    </v-row>
    <v-row>
      <v-col v-if="depTree" cols="12">
        <client-only placeholder="Loading...">
          <tree
            :key="depTreeKey"
            :data="depTree"
            :zoomable="zoomable"
            :min-zoom="minZoom"
            :max-zoom="maxZoom"
            node-text="name"
            :leaf-text-margin="leafTextMargin"
            :node-text-margin="leafTextMargin"
            node-text-display="all"
            pop-up-placement="right"
            class="tree"
          >
            <template #node="{ data, isRetracted }">
              <template v-if="data.children && data.children.length">
                <circle
                  :r="isRetracted ? 6 : 6"
                  :fill="circleColor()"
                  :stroke="circleColor()"
                >
                  <title>{{ data.name }}</title>
                </circle>
              </template>
              <template v-else>
                <circle r="6" :fill="circleColor()" :stroke="circleColor()">
                  <title>{{ data.name }}</title>
                </circle>
              </template>
            </template>
          </tree>
        </client-only>
      </v-col>
      <v-col v-if="!depTree" cols="2"> No Data </v-col>
    </v-row>
  </v-container>
</template>

<script>
export default {
  data() {
    return {
      leafTextMargin: 12,
      minZoom: 0.6,
      maxZoom: 2,
      zoomable: false,
      availableModes: [
        { text: 'Downstream', value: 'projectdownstream' },
        { text: 'Upstream', value: 'projectupstream' },
      ],
      projects: [],
      artifacts: [],
      selectedMode: 'projectdownstream',
      selectedProject: null,
      depTreeKey: null,
      depTree: null,
    }
  },
  async mounted() {
    const { data: projects } = await this.$axios.get('/api/gdep?t=projects')
    console.info(`Loaded projects: %o`, projects)
    projects.sort()
    this.projects = projects
  },
  methods: {
    async loadTree() {
      const { data: depTree } = await this.$axios.get(
        `/api/gdep?t=${this.selectedMode}&v=${this.selectedProject}`
      )
      console.info('Loaded dep tree: %o', depTree)
      if (depTree) {
        this.depTree = depTree
      } else {
        this.depTree = null
      }
      this.depTreeKey = `tree-id-${Math.random()}`
    },
    circleColor() {
      return 'blue'
    },
  },
}
</script>
<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;

  /* -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale; */

  text-align: center;
  color: blue;
}
.tree {
  height: 800px;
  width: 100%;
}
.treeclass .nodetree text {
  font-size: 1em;
}

.treeclass .nodetree circle {
  color: purple;
}

.treeclass .linktree {
  color: green;
}
.treeclass .pop-up-tree .hint {
  color: rgba(0, 0, 255, 0.817);
  font-size: 1em;
  padding-left: 1em;
}
</style>
