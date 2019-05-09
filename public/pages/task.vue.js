var spaTask = Vue.component("Task", {
    template: /*html*/`
<div>
    <div style="margin-bottom: 10px;"></div>
    <div v-if="task">
        <br/>
        <h3>{{ task.subject }}</h3>
        <b>{{ task.dueDateTime.dateTime.toLocaleString() }}</b> 
        <p>{{ task.id }}</p> 
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
            task: null,
            result:  {},
            progress : false,
            ready : false
        }
    },
    created() {
        let path = window.location.pathname;
        let prefix = '/task/';
        let idStart = path.indexOf(prefix);
        if (idStart <0) return;
        idStart += prefix.length;
        id = path.substring(idStart).trim();
        this.GetTask(id);
    },
    methods: {
        GetTask(id) {
            window.fetch(`/api/v1.0/task/${id}`)
            .then(response => response.json())                
            .then(json => {
                return this.task = json.value;
            })
            .catch(err => {
                console.error('Error',err);
            });

            this.progress = true;
            this.ready = true;
        }
    }
});
