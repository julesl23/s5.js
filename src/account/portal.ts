// storage service, pinning service, gateway, portal
class S5Portal {
    constructor(
        readonly protocol: string,
        readonly host: string,
        readonly headers: { [key: string]: string },
    ) { };

    apiURL(path: string, params?: { [key: string]: string }): string {
        const url = `${this.protocol}://${this.host}/s5/${path}`;
        if (params === undefined) {
            return url;
        } else {
            return `${url}?${new URLSearchParams(params)}`
        }
    }
}