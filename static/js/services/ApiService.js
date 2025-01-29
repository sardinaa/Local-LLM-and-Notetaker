export class APIService {
    async get(url) {
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Failed to fetch data from ${url}: ${response.statusText}`);
        }
        return response.json();
    }

    async post(url, data) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error(`Failed to post data to ${url}: ${response.statusText}`);
        }
        return response.json();
    }
}
