var spaTests = Vue.component("Tasks", {
    template: /*html*/`<div>
    <ul>
        <li><a href="/login">login</a></li>
        <li><a href="/test-tasks">tasks</a></li>
        <li><a href="/api/v1.0/me/tasks">API /me/tasks</a></li>
        <li><a href="/api/v1.0/me/connections">API /me/connections</a></li>
        <li><a href="/test-patch">singleValueExtendedProperties write</a></li>
        <li><a href="/test-mail">mail</a></li>
        <li><a href='/test-profile'>profile</a> </li>
        <li><a href='/test-update'>update profile</a></li>
        <li><a href='/test-notify'>use bots to notify</a></li>
        <li><a href='/test-cookies'>show cookies</a></li>
        <li><a href='/test-set-cookie'>test setting auth cookie</a></li>
        <li><a href='/metrics'>metrics</a></li>
    </ul>
    <p></p>
    <p>To manage app permissions go to <a href='https://myapps.microsoft.com'>https://myapps.microsoft.com</a></p>
</div>`,
    props: ["title"],
    data() {
        return {
            progress: true,
            ready: true
        }
    },
    created() {
    },
    methods: {
    }
});
