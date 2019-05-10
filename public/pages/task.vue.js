var spaTask = Vue.component("Task", {
    template: /*html*/`<div>
    <div style="margin-bottom: 10px;"></div>
    <div v-if="task">
        <br />
        <h3>{{ task.subject }}</h3>
        <p>{{ new Date(task.dueDateTime.dateTime).toDateString() }}</p>
        <p>
            <template v-for="category in task.categories">
                {{category}}
            </template>
        </p>
    </div>
</div>`,
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
            window.fetch(`/api/v1.0/tasks/${id}`)
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
        }
    }
});
