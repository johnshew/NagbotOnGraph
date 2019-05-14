var spaTasks = Vue.component("Tasks", {

    template: // html
        `<v-container fluid>
    <template v-for="(task, index) in tasks">
        <v-layout row align-center pa-1 >
            <v-flex shrink >
                <v-icon v-if="task.status === 'completed'" color="blue" @click="StatusChange(task)">check_circle_outline</v-icon>
                <v-icon v-else color="blue" @click="StatusChange(task)">radio_button_unchecked</v-icon>
            </v-flex>
            <v-flex grow pa-1 >
                <router-link :to="{ path: '/task/'+task.id }" style="text-decoration:none" headline>
                    {{ task.subject }}
                </router-link>
                <div>{{ new Date(task.dueDateTime.dateTime).toDateString() }}</div>
            </v-flex>
            <v-flex shrink align-center pa-1 >
                <v-icon v-if="!task.categories.includes('NagMe')" color="grey lighten-1" @click="NagChange(task)"> alarm_off </v-icon>
                <v-icon v-else color="green darken-1" @click="NagChange(task)"> alarm_on </v-icon>
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
            window.fetch("/api/v1.0/me/tasks")
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
        },
        UpdateTask(task) {
            let patch = { status: task.status, categories: task.categories };
            window.fetch(`/api/v1.0/me/tasks/${task.id}`, {
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
        StatusChange(task) {
            task.status = (task.status === "completed") ? "notStarted" : "completed";
            this.UpdateTask(task);
        },
        NagChange: async function (task) {
            if (task.categories.includes('NagMe')) { task.categories = task.categories.filter(category => category !== 'NagMe') }
            else { task.categories.splice(0, 0, 'NagMe'); }
            this.UpdateTask(task);
        }
    }
});
