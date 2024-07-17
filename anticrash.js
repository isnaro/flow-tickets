// anticrash.js

module.exports = (client) => {
    process.on('unhandledRejection', (error) => {
        console.error('Unhandled promise rejection:', error);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
    });

    process.on('warning', (warning) => {
        console.warn('Warning:', warning);
    });

    client.on('shardError', (error) => {
        console.error('A websocket connection encountered an error:', error);
    });

    client.on('error', (error) => {
        console.error('Discord client encountered an error:', error);
    });

    client.on('debug', (info) => {
        console.log('Debug:', info);
    });
};