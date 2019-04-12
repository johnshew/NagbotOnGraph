var spaTests = Vue.component("Tasks", {
    template: `<div>
        <p/>
        <h2>NagBot on Microsoft Graph</h2>
        <p><a href='./app.html'>Main App</a></p>
        <h2>Tests</h2>
        <ul>
            <li><a href="/login">login</a></li>
            <li><a href="/test-tasks">tasks</a>, <a href="/api/v1.0/tasks">API tasks</a>, <a href="/test-patch">test singleValueExtendedProperties write</a></li>
            <li><a href="/test-mail">mail</a></li>
            <li><a href='/test-profile'>profile</a> </li>
            <li><a href='/test-update'>update profile</a></li>
            <li><a href='/test-notify'>use bots to notify</a></li>
        </ul>

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
