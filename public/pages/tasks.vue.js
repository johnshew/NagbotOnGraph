var spaTasks = Vue.component("Tasks", {
    template: `<div>
    <div style="margin-bottom: 10px;"></div>
    
    <div v-for="task in tasks" v-if="tasks.length>0">
        <br/>
        <h3>{{ task.subject }}</h3>
        <b>{{task.dueDate.toString() }}</b> 
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
            let url =
                "../../api/tasks";
            this.progress = true;
            this.ready = true;
            this.tasks =[
                {
                    subject: 'Task 1',
                    categories: [],
                    dueDate: new Date(),                
                },
                {
                    subject: 'Task 2',
                    categories: ['Food', "Nag"],
                    dueDate: new Date(),
                }
            ]
        }
    }
});
