/**
 * scanner helper
 * read single file or multiple files
 */
'use strict';

var dateTypeEnum = require('../enum/dateType'),
    logClassEnum = require('../enum/logClass');
var util = require('../util');
var when = require('when');
var Msg = require('../message');
var moment = require('moment');

function readLogFile(options) {
    var promise;
    var readQueue = [];

    //if have the files options, then just load the appointed files
    if (options.files) {
        options.files.forEach(function (fileName) {
            readQueue.push(util.readLogFiles(fileName));
        });
    } else if (options.dateItems) {
        options.dateItems.forEach(function (date) {
            var m = new moment(date.value);
            if (date.type === dateTypeEnum.Day) {
                readQueue.push(readOneDayLog(m.year(), m.month() + 1, m.date()));
            } else if (date.type === dateTypeEnum.Month){
                readQueue = readQueue.concat(readOneMonthLog(m.year(), m.month() + 1));
            } else if (date.type === dateTypeEnum.Year) {
                readQueue = readOneYearLog(m.year());
            }
        });
        //use when.settle: because some file may not exist
        //so when.all is not appropriate
        promise = when.settle(readQueue);
    } else {
        var dateRange = options.dateRange;
        readQueue = readLogByDateRange(dateRange.from, dateRange.to);
    }

    promise = when.settle(readQueue);
    return promise.then(preprocessFileData.bind(null, options)).catch(function() {
        console.log('读取过程有错误');
    });
}


/**
 * read only the log of one specific day
 */
function readOneDayLog(year, month, day) {
    var date = [year, month, day].join('-');
    return util.readLogFiles(date);
}


/**
 * read only the log of one specific month
 *
 */
function readOneMonthLog(year, month) {
    //the day number of month
    var dayNum = util.getDayNumInMonth(year, month);
    var day = 1;
    var queue = [];
    while (day <= dayNum) {
        queue.push(readOneDayLog(year, month, day));
        day++;
    }
    return queue;
}


function readLogByDateRange(from, to) {
    var fromMoment = getMoment(from, true, false),
        toMoment = getMoment(to, false, true);
    if (toMoment.diff(fromMoment, 'days') < 0) {
        var error = 'Wrong date range';
        Msg.error(error);
        throw new Error(error);
    }
    var queue = [];
    while (fromMoment.diff(toMoment) < 0) {
        var date = fromMoment.format('YYYY-MM-DD');
        queue.push(util.readLogFiles(date));
        fromMoment.add(1, 'days');
    }
    return queue;

    function getMoment(dateObj, isStart, isEnd) {
        var dateType = dateObj.type,
            dateValue = dateObj.value,
            m;
        var operator;
        if (isStart) { operator = 'startOf'; }
        if (isEnd) { operator = 'endOf'; }
        if (dateType === dateTypeEnum.Day) {
            m = new moment(dateValue)[operator]('day');
        } else if (dateType === dateTypeEnum.Month) {
            m = new moment(dateValue)[operator]('month');
        } else if (dateType === dateTypeEnum.Year) {
            m = new moment(dateValue)[operator]('year');
        }
        return m;
    }
}

function readOneYearLog(year) {
    var month = 1;
    var queue = [];
    while (month <= 12) {
        queue = queue.concat(readOneMonthLog(year, month));
        month++;
    }
    return queue;
}

function preprocessFileData(options, fileData) {
    var unTrackedDays = [];
    return transformMultipleDays(fileData);
    function transformMultipleDays(days) {
        days = days.filter(function (d) {
            if (d.state === 'rejected') {
                var reason = d.reason;
                Msg.warn(reason.date + ' calculate fail');
                unTrackedDays.push(reason.date);
                return false;
            } else if (d.state === 'fulfilled'){
                return true;
            }
        }).map(function (d) {
            return d.value;
        });
        var today = new moment();
        unTrackedDays = unTrackedDays.filter(function (d) {
            return today.diff(new moment(d), 'days') >= 0;
        });
        return {
            days: days,
            unTrackedDays: unTrackedDays
        };
    }
}

function filterClass(logs, options) {
    var logClass = options.logClass,
        result;
    if (!logClass) { return logs; }
    Object.keys(logClassEnum).forEach(function (clsKey) {
        if (logClass === logClassEnum[clsKey]) {
            var filter = require('./filters/classes/' + clsKey.toLowerCase());
            result = logs.filter(filter);
        }
    });
    return result;
}

exports.readLogFile = readLogFile;
exports.filterClass = filterClass;
