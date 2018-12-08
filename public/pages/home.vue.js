var spaHome = Vue.component("Home", {
    template: `<div>
    <div style="margin-bottom: 10px;"></div>
    <div v-if="user !== null">
        <b-jumbotron header="NagBot Welcomes You" lead="What can I do for you?">
        </b-jumbotron>

    </div>
    <div v-else>
        You are not logged in. Please <a href="../login">login</a>
    </div>
</div>`,
    props: ["title"],
    data() {
        return {
            user : null
        }
    },
    created() {
        this.GetUser();
    },
    methods: {
        GetUser() {
            this.user = { preferredName : 'Nag Tester'};
        }
    }
});
