var spaTasks = Vue.component("Tasks", {
    template: /*html*/`
    
<v-container fluid>    
    <template v-for="(task, index) in tasks">
        <v-layout row>
            <v-flex grow pa-1>
                <router-link :to="{ path: './task/'+task.id }"> {{ task.subject }}</router-link>
                <div>{{ new Date(task.dueDateTime.dateTime).toLocaleString() }}</div>                
            </v-flex>
            <v-flex shrink pa-1>
                <v-icon v-if="task.categories.includes('NagMe')" color="grey lighten-1"> toggle_off </v-icon>
                <v-icon v-else color="yellow darken-2"> toggle_on </v-icon>                
            </v-flex>
        </v-layout>
        <v-layout row><v-divider v-if="index + 1 < tasks.length" :key="index"></v-divider></v-layout>
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
