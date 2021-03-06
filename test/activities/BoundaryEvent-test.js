'use strict';

const Code = require('code');
const EventEmitter = require('events').EventEmitter;
const expect = Code.expect;
const factory = require('../helpers/factory');
const Lab = require('lab');

const lab = exports.lab = Lab.script();
const Bpmn = require('../..');
const testHelper = require('../helpers/testHelpers');
const TimerEvent = require('../../lib/mapper')('bpmn:TimerEventDefinition');
const ErrorEvent = require('../../lib/mapper')('bpmn:ErrorEventDefinition');

lab.experiment('BoundaryEvent', () => {
  lab.test('returns TimerEvent type', (done) => {
    const engine = new Bpmn.Engine({
      source: factory.resource('boundary-timeout.bpmn')
    });
    engine.getInstance((err, instance) => {
      if (err) return done(err);
      const event = instance.getChildActivityById('boundTimeoutEvent');
      expect(event).to.be.instanceof(TimerEvent);
      done();
    });
  });

  lab.test('returns ErrorEvent type', (done) => {
    const engine = new Bpmn.Engine({
      source: factory.resource('bound-error.bpmn')
    });
    engine.getInstance((err, instance) => {
      if (err) return done(err);
      const event = instance.getChildActivityById('errorEvent');
      expect(event).to.be.instanceof(ErrorEvent);
      done();
    });
  });

  lab.test('set isStart to false and attachedTo', (done) => {
    const engine = new Bpmn.Engine({
      source: factory.resource('boundary-timeout.bpmn')
    });
    engine.getInstance((err, instance) => {
      if (err) return done(err);
      const event = instance.getChildActivityById('boundTimeoutEvent');
      expect(event.isStart).to.be.false();
      expect(event.attachedTo).to.exist();
      done();
    });
  });

  lab.test('is canceled if task emits caught error', (done) => {
    const engine = new Bpmn.Engine({
      source: factory.resource('bound-error-and-timer.bpmn')
    });
    const listener = new EventEmitter();
    listener.once('end-timerEvent', (e) => {
      Code.fail(`<${e}> should have been discarded`);
    });

    engine.execute({
      listener: listener
    }, (err, instance) => {
      if (err) return done(err);
      const timer = instance.getChildActivityById('timerEvent');

      let leaveTimerCount = 0;

      function timerListener(event) {
        leaveTimerCount++;
        if (leaveTimerCount > 1) Code.fail(`<${event.id}> should only leave once`);
      }
      timer.on('enter', timerListener);

      const error = instance.getChildActivityById('errorEvent');

      let leaveErrorCount = 0;

      function errorListener(event) {
        leaveErrorCount++;
        if (leaveErrorCount > 1) Code.fail(`<${event.id}> should only leave once`);
      }
      error.on('enter', errorListener);

      instance.once('end', () => {
        timer.removeListener('enter', timerListener);
        error.removeListener('enter', errorListener);
        testHelper.expectNoLingeringListeners(instance);
        done();
      });
    });
  });

  lab.test('takes timeout if no other bound event is caught', (done) => {
    const engine = new Bpmn.Engine({
      source: factory.resource('bound-error-and-timer.bpmn')
    });
    const listener = new EventEmitter();
    listener.once('end-errorEvent', (e) => {
      Code.fail(`<${e}> should have been discarded`);
    });

    engine.execute({
      listener: listener,
      variables: {
        input: 2
      }
    }, (err, instance) => {
      if (err) return done(err);

      instance.once('end', () => {
        testHelper.expectNoLingeringListeners(instance);
        done();
      });
    });
  });

  lab.test('completes process even if bound event markup appears before task', (done) => {
    const processXml = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions id="timeout" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="interruptedProcess" isExecutable="true">
    <boundaryEvent id="timeoutEvent" attachedToRef="dontWaitForMe">
      <timerEventDefinition>
        <timeDuration xsi:type="tFormalExpression">PT0.1S</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>
    <userTask id="dontWaitForMe" />
  </process>
</definitions>
    `;
    const engine = new Bpmn.Engine({
      source: processXml
    });
    const listener = new EventEmitter();

    engine.execute({
      listener: listener
    }, (err, instance) => {
      if (err) return done(err);
      instance.on('end', () => {
        done();
      });
    });
  });

});
