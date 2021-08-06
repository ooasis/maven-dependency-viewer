<template>
  <v-app>
    <v-app-bar dense app>
      <v-toolbar-title>Dependency Viewer</v-toolbar-title>
      <v-btn text nuxt :color="menuColor('/')" to="/">Home </v-btn>
      <v-btn text nuxt :color="menuColor('/admin')" to="/admin">Admin </v-btn>
      <v-spacer></v-spacer>
    </v-app-bar>
    <v-main>
      <v-container>
        <nuxt />
      </v-container>
    </v-main>
    <v-footer :absolute="!fixed" app>
      <span>&copy; {{ new Date().getFullYear() }}</span>
    </v-footer>
  </v-app>
</template>

<script>
export default {
  methods: {
    menuColor(link) {
      return this.$route.path === link ? 'primary' : 'secondary'
    },
  },
}
</script>
