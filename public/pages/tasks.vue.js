var spaTasks = Vue.component("Tasks", {
    template: `<div>
    <div style="margin-bottom: 10px;"></div>
    
    <div v-for="task in tasks" v-if="tasks.length>0">
        <br/>
        <h3>{{ task.subject }}</h3>
        <b>{{task.dueDateTime.dateTime }}</b> 
        <br/>[
        <template v-for="category in task.categories">
              {{category}}                
        </template>
        ]
    </div>

</div>`,
    props: ["title"],
    data() {
        return {
            tasks: [],
            result:  {},
            progress : false,
            ready : false
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
                return this.tasks = json.value;
            })
            .catch(err => {
                console.error('Error:',err);
            });

            this.progress = true;
            this.ready = true;
        }
    }
});
