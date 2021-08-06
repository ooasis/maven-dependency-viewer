<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-btn text color="deep-purple accent-4" @click="loadTree">
          Load Tree
        </v-btn>
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12">
        <client-only placeholder="Loading...">
          <tree
            :data="depTree"
            :zoomable="zoomable"
            :min-zoom="minZoom"
            :max-zoom="maxZoom"
            node-text="artifactId"
            :leaf-text-margin="leafTextMargin"
            :node-text-margin="leafTextMargin"
            node-text-display="extremities"
            pop-up-placement="right"
            class="tree"
          >
            <template #node="{ data, isRetracted }">
              <template v-if="data.children && data.children.length">
                <circle
                  :r="isRetracted ? 6 : 6"
                  :fill="circleColor(data.mode)"
                  :stroke="circleColor(data.mode)"
                >
                  <title>{{ data.name }}</title>
                </circle>
              </template>
              <template v-else>
                <circle
                  r="6"
                  :fill="circleColor(data.mode)"
                  :stroke="circleColor(data.mode)"
                >
                  <title>{{ data.name }}</title>
                </circle>
              </template>
            </template>
            <template #popUp="{ data }">
              <div>
                <span class="hint">{{ data.name }}</span>
              </div>
            </template>
            <template #behavior="{ on, actions }">
              <click-to-maven v-bind="{ on }" />
              <pop-up-on-hover-text v-bind="{ on, actions }" />
            </template>
          </tree>
        </client-only>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import ClickToMaven from '../components/ClickToMaven'

const convertNode = (node) => {
  if (node.mode) {
    // diff node
    node.name =
      node.mode === 'same'
        ? `${node.groupId}:${node.artifactId}:${node.versions[0]}`
        : `${node.groupId}:${node.artifactId}:${node.versions.join('|')}`
  } else {
    // regular node
    node.name = `${node.groupId}:${node.artifactId}:${node.version}`
  }

  if (node.children.length > 0) {
    for (const child of node.children) {
      convertNode(child)
    }
  } else {
    delete node.children
  }
}

export default {
  components: {
    ClickToMaven,
  },
  data() {
    return {
      leafTextMargin: 12,
      minZoom: 0.6,
      maxZoom: 2,
      zoomable: false,
      depTree: null,
    }
  },
  methods: {
    async loadTree() {
      const { data: depTree } = await this.$axios.get('/api/dep')
      convertNode(depTree)
      this.depTree = depTree
    },
    circleColor(mode) {
      if (mode === 'same') {
        return 'green'
      } else if (mode === 'conflict') {
        return 'red'
      } else if (mode === 'left') {
        return 'blue'
      } else if (mode === 'right') {
        return 'purple'
      } else {
        return 'black'
      }
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
  font-size: 0.5em;
}

.treeclass .nodetree circle {
  color: purple;
}

.treeclass .linktree {
  color: green;
}
.treeclass .pop-up-tree .hint {
  color: rgba(0, 0, 255, 0.817);
  font-size: 0.5em;
  padding-left: 1em;
}
</style>
