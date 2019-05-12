var spaConnections = Vue.component("Connections", {

    template: // html
        `<v-container fluid>
    Connections
    <template v-for="(connection, index) in connections">
        <v-layout row align-center pa-1>
            <v-flex shrink align-center pa-1>
                <v-icon v-if="connection.enabled" color="green darken-1" @click="StatusChange(connection)"> alarm_on </v-icon>
                <v-icon v-else color="grey lighten-1"  @click="StatusChange(connection)"> alarm_off</v-icon>
            </v-flex>
            <v-flex grow pa-1>
                {{ connection.nickname || connection.channelId }} <br />
            </v-flex>
        </v-layout>
        <v-layout row>
            <v-divider v-if="index + 1 < connection.length" :key="index"></v-divider>
        </v-layout>
    </template>
</v-container>`,

    props: ["title"],
    data() {
        return {
            connections: [],
            result: {},
            progress: false,
            ready: false
        }
    },
    created() {
        this.GetConnections();
    },
    methods: {
        GetConnections() {
            window.fetch("/api/v1.0/me/connections")
                .then(response => {
                    return response.json();
                }).then(json => {
                    this.connections = json;
                    this.progress = true;
                    this.ready = true;
                    return;
                })
                .catch(err => {
                    console.error('Error:', err);
                });
        },
        UpdateConnection(connection) {
            let patch = { enabled: connection.enabled };
            window.fetch(`/api/v1.0/me/connections/${connection.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            })
                .then(response => {
                    return response.json();
                })
                .then(json => {
                    task = json;
                })
                .catch(err => console.error(err))
        },
        StatusChange(connection) {
            connection.enabled = connection.enabled ? false : true;
            this.UpdateConnection(connection);
        },
    }
});
