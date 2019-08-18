var spaHome = Vue.component("Home", {
    template: /*html*/`
<div>
    <div style="padding: 1px;"></div>
    <div v-if="id !== null">
        <h3>Welcome {{ displayName }}</h3>
        <p>Your id is {{ id }}</p>
    </div>
    <div v-else>
        You are not logged in.<br/>
        <br/>
        Please <a href="/login">login</a>.<br/>
        <br/>
        Or you can login on your mobile device using a <a href='/qr'>QR code</a>.
    </div>
</div>`,
    props: {
        user: Object
    },
    data() {
        return {
            progress: false,
            ready: false
        };
    },
    created() {
        if (!this.user) {
            this.GetUser();
        }
    },
    computed: {
        displayName: function () {
            let result = this.user ? this.user.displayName : null;
            return result;
        }
        ,
        id: function () {
            let result = this.user ? this.user.id : null;
            return result;
        }
    },
    methods: {
        GetUser() {
            window.fetch("/api/v1.0/me", {cache: "no-store"})
                .then(response => {
                    if (response.status != 200) return null;
                    return response.json();
                }).then(json => {
                    if (json) {
                        this.progress = true;
                        this.ready = true;
                        this.$emit("update-user", json);
                        return;
                    }
                })
                .catch(err => {
                    console.error('Error', err);
                });
        }
    }
});
