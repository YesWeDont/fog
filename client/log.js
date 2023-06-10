if(!process.env.VERBOSE){
    require('longjohn');
    module.exports = console.log;
    function timeTick() {
        var startTime = (new Date().getTime());
        function onTick() {
            var interval = (new Date().getTime()) - startTime;
            if(interval > 5)
                console.log('timeTick(): WARNING: interval = ' + interval);
        }
       process.nextTick(onTick);
    }
    setInterval(timeTick, 1000);
}else module.exports = ()=>{};