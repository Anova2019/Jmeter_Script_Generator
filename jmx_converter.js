// JMX Converter Utility

function generateJMX(requests) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Recorded Test Plan" enabled="true">
      <stringProp name="TestPlan.comments"></stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">1</stringProp>
        <stringProp name="ThreadGroup.ramp_time">1</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
        <stringProp name="ThreadGroup.duration"></stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
`;

  const footer = `
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;

  // Group requests by step
  const groupedRequests = [];
  let currentGroup = null;

  requests.forEach(req => {
    const stepName = req.step || 'Init';
    if (!currentGroup || currentGroup.name !== stepName) {
      currentGroup = { name: stepName, requests: [] };
      groupedRequests.push(currentGroup);
    }
    currentGroup.requests.push(req);
  });

  let content = '';

  groupedRequests.forEach(group => {
    content += createTransactionController(group.name, group.requests);
  });

  return header + content + footer;
}

function createTransactionController(name, requests) {
  let samplers = '';
  requests.forEach((req, index) => {
    samplers += createHTTPSampler(req, index);
  });

  return `
        <TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="${escapeXml(name)}" enabled="true">
          <boolProp name="TransactionController.includeTimers">false</boolProp>
          <boolProp name="TransactionController.parent">false</boolProp>
        </TransactionController>
        <hashTree>
            ${samplers}
        </hashTree>
    `;
}

function createHTTPSampler(req, index) {
  const url = new URL(req.url);
  const protocol = url.protocol.replace(':', '');
  const domain = url.hostname;
  const port = url.port || (protocol === 'https' ? '443' : '80');
  const path = url.pathname;
  const method = req.method;
  const queryParams = url.searchParams;

  let argumentsXml = '';
  let hasBody = false;

  // Handle POST Body
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.requestBody) {
      // If we captured raw body
      if (req.requestBody.raw) {
        // Placeholder for body handling
        hasBody = true;
      } else if (req.requestBody.formData) {
        // Handle form data
        let args = '';
        for (const key in req.requestBody.formData) {
          const value = req.requestBody.formData[key][0];
          args += `
            <elementProp name="${escapeXml(key)}" elementType="HTTPArgument">
              <boolProp name="HTTPArgument.always_encode">true</boolProp>
              <stringProp name="Argument.value">${escapeXml(value)}</stringProp>
              <stringProp name="Argument.metadata">=</stringProp>
              <boolProp name="HTTPArgument.use_equals">true</boolProp>
              <stringProp name="Argument.name">${escapeXml(key)}</stringProp>
            </elementProp>`;
        }
        argumentsXml = `<collectionProp name="Arguments.arguments">${args}</collectionProp>`;
      }
    }
  }

  // If no body arguments yet, use query params or empty
  if (!argumentsXml) {
    let args = '';
    queryParams.forEach((value, key) => {
      args += `
            <elementProp name="${escapeXml(key)}" elementType="HTTPArgument">
              <boolProp name="HTTPArgument.always_encode">true</boolProp>
              <stringProp name="Argument.value">${escapeXml(value)}</stringProp>
              <stringProp name="Argument.metadata">=</stringProp>
              <boolProp name="HTTPArgument.use_equals">true</boolProp>
              <stringProp name="Argument.name">${escapeXml(key)}</stringProp>
            </elementProp>`;
    });
    argumentsXml = `<collectionProp name="Arguments.arguments">${args}</collectionProp>`;
  }

  // Header Manager
  let headerManager = '';
  if (req.requestHeaders && req.requestHeaders.length > 0) {
    let headers = '';
    req.requestHeaders.forEach(h => {
      if (!['Host', 'Content-Length', 'Connection'].includes(h.name)) { // Skip auto-generated headers
        headers += `
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">${escapeXml(h.name)}</stringProp>
              <stringProp name="Header.value">${escapeXml(h.value)}</stringProp>
            </elementProp>`;
      }
    });

    headerManager = `
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
          <collectionProp name="HeaderManager.headers">
            ${headers}
          </collectionProp>
        </HeaderManager>
        <hashTree/>`;
  }

  return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(method)} ${escapeXml(path)}" enabled="true">
          ${argumentsXml}
          <stringProp name="HTTPSampler.domain">${escapeXml(domain)}</stringProp>
          <stringProp name="HTTPSampler.port">${escapeXml(port)}</stringProp>
          <stringProp name="HTTPSampler.protocol">${escapeXml(protocol)}</stringProp>
          <stringProp name="HTTPSampler.path">${escapeXml(path)}</stringProp>
          <stringProp name="HTTPSampler.method">${escapeXml(method)}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </HTTPSamplerProxy>
        <hashTree>
            ${headerManager}
        </hashTree>
    `;
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
