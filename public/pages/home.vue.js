var spaHome = Vue.component("Home", {
    template: /*html*/`
<div>
    <div style="padding: 1px;"></div>
    <div v-if="id !== null">
        <h3>Welcome {{ displayName }}</h3>
        <p>Your id is {{ id }}</p>
    </div>
    <div v-else>
        You are not logged in. Please <a href="/login">login</a>
    </div>
</div>`,
    props: ["title"], // "displayName","user","id"],
    data() {
        return {
            displayName: null,
            user: null,
            id: null
        };
    },
    created() {
        this.GetUser();
    },
    methods: {
        GetUser() {
            window.fetch("/api/v1.0/me")
                .then(response => {
                    if (response.status != 200) return null;
                    return response.json();
                }).then(json => {
                    if (json) {
                        this.displayName = json.displayName;
                        this.id = json.id;
                        this.user = json;
                    }
                    return
                })
                .catch(err => {
                    console.error('Error', err);
                });

            this.progress = true;
            this.ready = true;

            this.user = { preferredName: 'Nag Tester' };
        }
    }
});
