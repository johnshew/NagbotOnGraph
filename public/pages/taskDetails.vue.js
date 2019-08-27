var spaTaskDetails = Vue.component("TaskDetails", {
    template:
/*html*/`<v-container fluid>
    <v-layout row align-top pa-1 v-if="task">
        <v-flex shrink align-top pa-1>
            <v-icon v-if="!task.categories.includes('NagMe')" color="grey lighten-1" @click="NagChange(task)"> alarm_off
            </v-icon>
            <v-icon v-else color="green darken-1" @click="NagChange(task)"> alarm_on </v-icon>
        </v-flex>
        <v-flex shrink align-top pa-1>
            <v-icon v-if="task.status === 'completed'" color="blue" @click="StatusChange(task)">check_circle_outline
            </v-icon>
            <v-icon v-else color="blue" @click="StatusChange(task)">radio_button_unchecked</v-icon>
        </v-flex>
        <v-flex grow pa-1>
            <div>{{ task.subject }}</div>
            <p style="font-size: smaller; color:lightblue">
                {{ task.dueDateTime && new Date(task.dueDateTime.dateTime).toDateString() }}  
                {{ task.status === "notStarted" ? 'not started' : task.status }}</p>
            <div v-html="task.body.content"></div>
            <template v-for="category in task.categories">
            <v-chip>
            {{category}}
            </v-chip>
                </template>
        
        </v-flex>
    </v-layout>
    <v-layout row pa-1 v-if="ready && !task">
    Nothing to show.<router-link to="/login">Login</router-link>
    </v-layout>
</v-container fluid>`,
    props: ["id"],
    data() {
        return {
            task: null,
            result: {},
            progress: false,
            ready: false
        }
    },
    created() {
        id = this.id || this.GetIdFromPath();
        this.GetTask(id);
    },
    methods: {
        GetTask(id) {
            window.fetch(`/api/v1.0/me/tasks/${id}`, {cache: "no-store"})
                .then(response => {
                    return response.json();
                })
                .then(json => {
                    this.task = json;
                    this.progress = true;
                    this.ready = true;
                    return
                })
                .catch(err => {
                    console.error('Error', err);
                    this.ready = true
                });

        },
        GetIdFromPath() {
            let path = window.location.pathname;
            let prefix = '/task/';
            let idStart = path.indexOf(prefix);
            if (idStart < 0) return;
            idStart += prefix.length;
            id = path.substring(idStart).trim();
            return id;
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
