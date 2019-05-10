var spaTasks = Vue.component("Tasks", {
    template: /*html*/
`<v-container fluid>
    <template v-for="(task, index) in tasks">
        <v-layout row>
            <v-flex shrink pa-1>
                <v-icon v-if="task.status === 'notStarted'">radio_button_checked</v-icon>
                <v-icon v-else>radio_button_unchecked</v-icon>
            </v-flex>
            <v-flex grow pa-1 >
                <router-link :to="{ path: '/task/'+task.id }" style="text-decoration:none" headline> {{ task.subject }}</router-link>
                {{ new Date(task.dueDateTime.dateTime).toLocaleString() }}
            </v-flex>
            <v-flex shrink pa-1>
                <v-icon v-if="!task.categories.includes('NagMe')" color="grey lighten-1"> alarm_off </v-icon>
                <v-icon v-else color="green darken-1"> alarm_on </v-icon>
            </v-flex>
        </v-layout>
        <v-layout row>
            <v-divider v-if="index + 1 < tasks.length" :key="index"></v-divider>
        </v-layout>
    </template>
</v-container>`,
    props: ["title"],
    data() {
        return {
            tasks: [],
            result: {},
            progress: false,
            ready: false
        }
    },
    created() {
        this.GetTasks();
    },
    methods: {
        GetTasks() {
            window.fetch("/api/v1.0/tasks")
                .then(response => {
                    return response.json();
                }).then(json => {
                    this.tasks = json.value;
                    this.progress = true;
                    this.ready = true;
                    return;
                })
                .catch(err => {
                    console.error('Error:', err);
                });
        }
    }
});
