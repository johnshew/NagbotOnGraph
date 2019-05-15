var spaConnections = Vue.component("Connections", {

    template: /*html*/`<v-container fluid>
    <div v-if="user !== null">
        <template v-for="(connection, index) in connections">
            <v-layout row align-center pa-1>
                <v-flex shrink align-center pa-1>
                    <v-icon v-if="connection.nagEnabled" color="green darken-1" @click="StatusChange(connection)">
                        alarm_on
                    </v-icon>
                    <v-icon v-else color="grey lighten-1" @click="StatusChange(connection)">alarm_off</v-icon>
                </v-flex>
                <v-flex shrink align-center pa-1>
                    <v-icon @click="Delete(connection)">delete</v-icon>
                </v-flex>
                <v-flex grow pa-1>
                    {{ connection.nickname || connection.channelId }} <br />
                </v-flex>
            </v-layout>
            <v-layout row>
                <v-divider v-if="index + 1 < connection.length" :key="index"></v-divider>
            </v-layout>
        </template>
    </div>
    <div v-else-if="userCheckDone">Please <a href='/login'>login</a></div>
    <div v-else>Loading...</div>
</v-container>`,

    props: { user: Object },
    data() {
        return {
            connections: [],
            ready: false,
            userCheckDone: false,
        }
    },
    created() {
        if (this.user) { this.GetConnections(); }
        else { this.GetUser() }
    },
    watch: {
        user: function (newUser, oldUser) {
            if (this.ready && newUser && oldUser && newUser.id === oldUser.id) return;
            this.GetConnections();
        }
    },
    methods: {
        GetUser() {
            window.fetch("/api/v1.0/me", { cache: "no-store" })
                .then(response => {
                    return response.json();
                }).then(json => {
                    this.$emit("update-user", json);
                    setTimeout(() => { this.userCheckDone = true }, 100); // debounce eventing
                    return;
                })
                .catch(err => {
                    this.userCheckDone = true;
                    console.error('Error:', err);
                });
        },
        GetConnections() {
            window.fetch("/api/v1.0/me/connections", { cache: "no-store" })
                .then(response => {
                    return response.json();
                }).then(json => {
                    this.connections = json;
                    this.ready = true;
                    return;
                })
                .catch(err => {
                    console.error('Error:', err);
                });
        },
        UpdateConnection(connection) {
            window.fetch(`/api/v1.0/me/connections/${connection.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(connection),
            })
                .then(response => {
                    setTimeout(() => { this.GetConnections(); }, 500) // reload - if too fast graph misses update
                })
                .catch(err => console.error(err))
        },
        StatusChange(connection) {
            connection.nagEnabled = !connection.nagEnabled;
            this.UpdateConnection(connection);
        },
        Delete(connection) {
            window.fetch(`/api/v1.0/me/connections/${connection.id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(connection),
            })
                .then(response => {
                    setTimeout(() => { this.GetConnections(); }, 500) // reload - if too fast graph misses update
                })
                .catch(err => console.error(err))
        }
    }
});
