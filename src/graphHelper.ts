import { default as fetch } from 'node-fetch';
import { SSL_OP_ALL } from 'constants';

export class GraphHelper { 

    public async get<T>(accessToken: string, url: string): Promise<T> {
        return new Promise<T>(async (resolve, reject) => {
            let response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            });
            if (response.status == 200 || response.status == 204) {
                let data = await response.json();
                return resolve(data);
            }
            return reject(response.status);
        });
    }

    public async patch(accessToken: string, url: string, body: any): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            let options = {
                method: 'patch',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify( body)
            }
            let response = await fetch(url, options);
            if (response.status == 200 || response.status == 204) {
                return resolve();
            }
            return reject(response.status);
        });
    }

    public async post(accessToken: string, url: string, body: any): Promise<string | null> {
        return new Promise<string | null>(async (resolve, reject) => {
            let options = {
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                },
                body: JSON.stringify(body)
            }
            let response = await fetch(url, options);            
            if (response.status == 201 || response.status == 200 || response.status == 204) {
                return resolve(response.headers.get('location'));
            }
            return reject(response.status);
        });
    }
}
