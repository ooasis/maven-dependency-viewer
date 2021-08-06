const publicUrl = 'https://repo1.maven.org/maven2'
const internalUrl = process.env.INTERNAL_MAVEN_REPO

  const isInternalPackage = (groupId, internalPackages) => {
    for (internalPackage of internalPackages ) {
      if (groupId.indexOf(internalPackage) > 0) {
        return true
      }
    }
    return false
  }
  
  const isInternal = ({ groupid: groupId, version }) => {
    const internalPackages = process.env.INTERNAL_PACKAGES.split(",")
    return (
      isInternalPackage(groupId, internalPackages) &&
      !(version && version.toLowerCase().indexOf('snapshot')) > 0
    )
  }

const getPOMUrl = (groupId, artifactId, version) => {
  const groupPath = groupId.replace(/\./g, '/')
  const baseUrl = isInternal(groupId) ? internalUrl : publicUrl
  return `${baseUrl}/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`
}

export default {
  props: ['on'],

  render: () => null,

  created() {
    const { on } = this

    on('clickedNode', ({ element: { data } }) => {
      const uniqueVersions = new Set(data.versions)
      uniqueVersions.forEach((version) => {
        const win = window.open(
          getPOMUrl(data.groupId, data.artifactId, version),
          '_blank'
        )
        win.focus()
      })
    })
  },
}
