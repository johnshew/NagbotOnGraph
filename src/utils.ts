
// a tagged template for including timestamps and having rational debug output
// "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals"

export function logger(literals: TemplateStringsArray, ...items: any[]) {
    let result = new Date(Date.now()).toISOString() + " " + literals[0]
    for (let i = 0; i < items.length; i++) {
        let item = items[i];
        result += show(item);
        result += literals[i + 1];
    }
    return result;
}

function show(item: any) {
    switch (typeof item) {
        case 'undefined':
            return 'undefined';
            break;
        case 'string':
            return item;
            break;
        case 'object':
            return `[${typeof item} ${JSON.stringify(item).substring(0, 20)}]`;
            break;
        case 'function':
            return `[${item.toString().subst}]`;
            break;
        default:
            if (typeof item.toString == 'function') return item.toString();
            return `[${typeof item} ${JSON.stringify(item).substring(0, 20)}]`;
            break;
    }
}

if (false) {
    console.log(logger`log test ${{ foo: 'foo' }} ${10}`);
    console.log(logger`multiple args test`, new Error('Test'));
}

export function delay<T>(t: number, value?: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), t));
}

export async function retry<T>(count : number, msDelay : number, callback : () => Promise<T> ) {
    return new Promise<T>(async (resolve, reject) => {
        let result : T;
        for (let i = 0; i<count; i++) {
            try {
                result = await callback();
                return resolve(result);
            } catch (err) {
                // assume underlying function does any logging.
            }
            await delay(msDelay);
            msDelay *= 2;
        }
        return reject('retry failed');
    });
}
