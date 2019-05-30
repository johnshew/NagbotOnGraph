
export function htmlList(list: string[]) {
    if (!list || list.length === 0) { return ''; }
    const items = list.reduce<string>((prev, current) => (prev + '<li>' + current + '</li>'), '');
    return `<ul> ${items} </ul>`;
}

export function htmlPrettyPrint(item: any) {
    return `<pre>${JSON.stringify(item, null, 2)}</pre>`;
}

function htmlPage(title: string, body: string) { return `
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> ${ title } </title>
    <link type="text/css" rel="stylesheet" href="https://unpkg.com/css-type-base/index.css" />
</head>
<body>
${ body}
</body>
</html>`;
}

export function htmlBody(title: string = '', message: string = '', content: string = '', footer: string = '') { return  `
    <h2>${ title}</h2>
    <div>${ message}</div>
    ${ content }
    <div> ${ footer} <div>`;
}

export function htmlPageFromList(title: string, message: string, list: string[], footer: string) {
    return  htmlPage(title, htmlBody(title, message,  htmlList(list), footer));
}

export function htmlPageFromObject(title: string, message: string, item: any, footer: string) {
    return  htmlPage(title, htmlBody(title, message,  htmlPrettyPrint(item), footer));
}

export function htmlPageMessage(title: string, message: string, footer: string) {
    return  htmlPage(title, htmlBody(title, message, '', footer));
}
