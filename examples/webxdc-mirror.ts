import { S5 } from "../src/s5"

async function run() {
    const s5 = await S5.create({})

    if (!s5.hasIdentity) {
        const seedPhrase = await s5.generateSeedPhrase()
        console.log('newly generated s5 seed phrase:', seedPhrase)
        await s5.recoverIdentityFromSeedPhrase(seedPhrase)
        await s5.registerOnNewPortal('https://s5.ninja')
    }
    await s5.fs.ensureIdentityInitialized()

    console.log("s5", "init done")

    await s5.fs.createDirectory('home', 'apps')

    const res = await fetch('https://apps.testrun.org/xdcget-lock.json')
    for (const app of await res.json()) {
        console.log('webxdc app', app)
        const xdcFileRes = await fetch(`https://apps.testrun.org/${app.cache_relname}`)
        const xdcFileBytes = await xdcFileRes.blob()
        const fileVersion = await s5.fs.uploadBlobWithoutEncryption(xdcFileBytes)
        await s5.fs.createFile('home/apps', app.cache_relname, fileVersion)
    }

    const dir = await s5.fs.list('home/apps')
    console.log('dir', dir)
}

run()