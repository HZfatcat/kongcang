import React, { useState, useMemo, useEffect } from 'react';
import { Card, Table, Typography, Tag, Space, Button, Switch, message, DatePicker, Row, Col, Statistic, Spin, Rate, Modal, Form, Input, Select, Popconfirm } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ResizableTable } from '../components/ResizableTable';
import { fetchUdescAgents, fetchUdescAgentPerformance, fetchAgents, fetchUdescAgentIds, upsertAgent, deleteAgent, upsertWecomEmployee, deleteWecomEmployee } from '../api/udesc';
import type { UdescAgentDetail, UdescAgentPerformance, AgentProfile } from '../types/udesc';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { RangePicker } = DatePicker;

interface WecomEmployee {
  userId: string;
  name?: string;
  department?: string;
  position?: string;
  mobile?: string;
  email?: string;
  avatar?: string;
  enabled: boolean;
  isCustomerService: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export function UsersPage() {
  const [activeTab, setActiveTab] = React.useState<'agents' | 'employees'>('agents');
  const [pageSize, setPageSize] = React.useState(20);

  // ========== 本地客服人员状态 ==========
  const [localAgents, setLocalAgents] = useState<AgentProfile[]>([]);
  const [localAgentsLoading, setLocalAgentsLoading] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentForm] = Form.useForm();
  const [udescAgentIds, setUdescAgentIds] = useState<string[]>([]);

  // ========== Udesk 客服绩效状态 ==========
  const [showDisabled, setShowDisabled] = useState(false);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfData, setPerfData] = useState<UdescAgentPerformance | null>(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfRange, setPerfRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });
  const [selectedAgent, setSelectedAgent] = useState<UdescAgentDetail | null>(null);

  const apiRange = useMemo(
    () => ({
      startDateIso: perfRange[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDateIso: perfRange[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    }),
    [perfRange],
  );

  // ========== 企微员工管理状态 ==========
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeForm] = Form.useForm();

  // 获取企微员工列表
  const { data: employees = [], isLoading: employeesLoading, refetch: refetchEmployees } = useQuery({
    queryKey: ['wecom-employee'],
    queryFn: async () => {
      const res = await apiClient.get<WecomEmployee[]>('/wecom-employee');
      return res.data;
    },
  });

  // 加载本地客服人员
  const loadLocalAgents = async () => {
    setLocalAgentsLoading(true);
    try {
      const data = await fetchAgents();
      setLocalAgents(data);
    } catch {
      message.error('加载客服数据失败');
    } finally {
      setLocalAgentsLoading(false);
    }
  };

  // 加载 Udesk Agent IDs (用于下拉选择)
  const loadUdescAgentIds = async () => {
    try {
      const ids = await fetchUdescAgentIds();
      setUdescAgentIds(ids);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeTab === 'agents') {
      loadLocalAgents();
    }
  }, [activeTab]);

  // 加载绩效数据
  const loadPerformance = async (agentId: string) => {
    setPerfLoading(true);
    try {
      const resp = await fetchUdescAgentPerformance(agentId, {
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
      });
      setPerfData(resp);
    } catch {
      message.error('加载客服绩效数据失败');
    } finally {
      setPerfLoading(false);
    }
  };

  const showPerformance = (record: AgentProfile) => {
    // 使用 agentId 查询 Udesk 绩效
    setSelectedAgent({ id: record.agentId, name: record.displayName } as UdescAgentDetail);
    setPerfOpen(true);
    loadPerformance(record.agentId);
  };

  // 新增客服
  const handleAddAgent = () => {
    setEditingAgentId(null);
    agentForm.resetFields();
    agentForm.setFieldsValue({ enabled: true });
    loadUdescAgentIds();
    setAgentModalOpen(true);
  };

  // 编辑客服
  const handleEditAgent = (record: AgentProfile) => {
    setEditingAgentId(record.agentId);
    agentForm.setFieldsValue({
      agentId: record.agentId,
      displayName: record.displayName,
      team: record.team,
      role: record.role,
      enabled: record.enabled,
      remark: record.remark,
    });
    loadUdescAgentIds();
    setAgentModalOpen(true);
  };

  // 保存客服
  const handleSaveAgent = async () => {
    const values = await agentForm.validateFields();
    setSavingAgent(true);
    try {
      await upsertAgent(values);
      message.success('保存成功');
      setAgentModalOpen(false);
      await loadLocalAgents();
    } finally {
      setSavingAgent(false);
    }
  };

  // 删除客服
  const handleDeleteAgent = async (agentId: string) => {
    await deleteAgent(agentId);
    message.success('已删除');
    await loadLocalAgents();
  };

  // ========== 企微员工管理函数 ==========
  // 新增员工
  const handleAddEmployee = () => {
    setEditingEmployeeId(null);
    employeeForm.resetFields();
    employeeForm.setFieldsValue({ enabled: true, isCustomerService: false });
    setEmployeeModalOpen(true);
  };

  // 编辑员工
  const handleEditEmployee = (record: WecomEmployee) => {
    setEditingEmployeeId(record.userId);
    employeeForm.setFieldsValue({
      userId: record.userId,
      name: record.name,
      department: record.department,
      position: record.position,
      mobile: record.mobile,
      email: record.email,
      enabled: record.enabled,
      isCustomerService: record.isCustomerService,
      remark: record.remark,
    });
    setEmployeeModalOpen(true);
  };

  // 保存员工
  const handleSaveEmployee = async () => {
    const values = await employeeForm.validateFields();
    setSavingEmployee(true);
    try {
      await upsertWecomEmployee(values);
      message.success('保存成功');
      setEmployeeModalOpen(false);
      await refetchEmployees();
    } finally {
      setSavingEmployee(false);
    }
  };

  // 删除员工
  const handleDeleteEmployee = async (userId: string) => {
    await deleteWecomEmployee(userId);
    message.success('已删除');
    await refetchEmployees();
  };

  const agentColumns = [
    {
      title: '客服ID',
      dataIndex: 'agentId',
      width: 120,
      ellipsis: true,
    },
    {
      title: '姓名',
      dataIndex: 'displayName',
      width: 120,
      render: (name: string | null) => name || '-',
    },
    {
      title: '团队',
      dataIndex: 'team',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 150,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, record: AgentProfile) => (
        <Space>
          <Typography.Link onClick={() => showPerformance(record)}>绩效</Typography.Link>
          <Button size="small" onClick={() => handleEditAgent(record)}>编辑</Button>
          <Popconfirm
            title="确认删除该客服？"
            onConfirm={() => handleDeleteAgent(record.agentId)}
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const employeeColumns = [
    {
      title: '用户ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 120,
      sorter: (a: WecomEmployee, b: WecomEmployee) => a.userId.localeCompare(b.userId),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      sorter: (a: WecomEmployee, b: WecomEmployee) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 150,
      ellipsis: true,
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      width: 120,
    },
    {
      title: '手机',
      dataIndex: 'mobile',
      key: 'mobile',
      width: 120,
    },
    {
      title: '客服',
      dataIndex: 'isCustomerService',
      key: 'isCustomerService',
      width: 80,
      sorter: (a: WecomEmployee, b: WecomEmployee) => Number(a.isCustomerService) - Number(b.isCustomerService),
      render: (isCs: boolean) => (
        <Tag color={isCs ? 'blue' : 'default'}>{isCs ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      sorter: (a: WecomEmployee, b: WecomEmployee) => Number(a.enabled) - Number(b.enabled),
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>{enabled ? '在职' : '离职'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: WecomEmployee) => (
        <Space>
          <Button size="small" onClick={() => handleEditEmployee(record)}>编辑</Button>
          <Popconfirm
            title="确认删除该员工？"
            onConfirm={() => handleDeleteEmployee(record.userId)}
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const chartOption = perfData
    ? {
        title: { text: '会话趋势' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['会话数', '平均评分'] },
        xAxis: { type: 'category', data: perfData.dailyStats.map((d) => d.date) },
        yAxis: [
          { type: 'value', name: '会话数' },
          { type: 'value', name: '评分', min: 0, max: 5 },
        ],
        series: [
          { name: '会话数', type: 'bar', data: perfData.dailyStats.map((d) => d.sessions) },
          { name: '平均评分', type: 'line', yAxisIndex: 1, data: perfData.dailyStats.map((d) => d.avgRating) },
        ],
      }
    : null;

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button type={activeTab === 'agents' ? 'primary' : 'default'} onClick={() => setActiveTab('agents')}>
          客服人员
        </Button>
        <Button type={activeTab === 'employees' ? 'primary' : 'default'} onClick={() => setActiveTab('employees')}>
          全部员工
        </Button>
      </Space>

      {activeTab === 'agents' && (
        <Card 
          title={<span style={{ fontWeight: 600 }}>客服人员管理</span>}
          style={{ borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          extra={
            <Space>
              <Button type="primary" onClick={handleAddAgent}>新增客服</Button>
            </Space>
          }
        >
          <Spin spinning={localAgentsLoading}>
            <Table
              rowKey="agentId"
              columns={agentColumns}
              dataSource={localAgents}
              pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
              scroll={{ x: 1200 }}
            />
          </Spin>
        </Card>
      )}

      {activeTab === 'employees' && (
        <Card 
          title={<span style={{ fontWeight: 600 }}>企微员工管理</span>}
          style={{ borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          extra={
            <Button type="primary" onClick={handleAddEmployee}>新增员工</Button>
          }
        >
          <ResizableTable<WecomEmployee>
            rowKey="userId"
            dataSource={employees}
            columns={employeeColumns}
            pagination={{
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onShowSizeChange: (_, size) => setPageSize(size),
              showTotal: (total) => `共 ${total} 条`,
            }}
            size="middle"
            loading={employeesLoading}
          />
        </Card>
      )}

      {/* 新增/编辑客服弹窗 */}
      <Modal
        title={editingAgentId ? '编辑客服' : '新增客服'}
        open={agentModalOpen}
        confirmLoading={savingAgent}
        onCancel={() => setAgentModalOpen(false)}
        onOk={handleSaveAgent}
      >
        <Form form={agentForm} layout="vertical">
          <Form.Item
            name="agentId"
            label="客服ID"
            rules={[{ required: true, message: '请输入客服ID' }]}
          >
            <Select
              showSearch
              placeholder="选择 Udesk 客服 ID 或手动输入"
              disabled={!!editingAgentId}
              optionFilterProp="children"
              allowClear
            >
              {udescAgentIds.map((id) => (
                <Select.Option key={id} value={id}>
                  {id}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="displayName"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="team" label="团队">
            <Input placeholder="请输入团队" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Input placeholder="请输入角色" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增/编辑企微员工弹窗 */}
      <Modal
        title={editingEmployeeId ? '编辑员工' : '新增员工'}
        open={employeeModalOpen}
        confirmLoading={savingEmployee}
        onCancel={() => setEmployeeModalOpen(false)}
        onOk={handleSaveEmployee}
      >
        <Form form={employeeForm} layout="vertical">
          <Form.Item
            name="userId"
            label="用户ID"
            rules={[{ required: true, message: '请输入用户ID' }]}
          >
            <Input placeholder="请输入用户ID" disabled={!!editingEmployeeId} />
          </Form.Item>
          <Form.Item name="name" label="姓名">
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="请输入部门" />
          </Form.Item>
          <Form.Item name="position" label="职位">
            <Input placeholder="请输入职位" />
          </Form.Item>
          <Form.Item name="mobile" label="手机">
            <Input placeholder="请输入手机号" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item name="isCustomerService" label="是否客服" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 绩效分析弹窗 */}
      <Modal
        title={`${selectedAgent?.name || selectedAgent?.id} - 绩效分析`}
        open={perfOpen}
        onCancel={() => setPerfOpen(false)}
        footer={null}
        width={900}
      >
        <Space style={{ marginBottom: 16 }}>
          <RangePicker
            value={perfRange}
            onChange={(dates) => dates && setPerfRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
          />
          <Typography.Link onClick={() => selectedAgent && loadPerformance(selectedAgent.id)}>
            刷新
          </Typography.Link>
        </Space>

        <Spin spinning={perfLoading}>
          {perfData && (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={4}>
                  <Statistic title="总会话数" value={perfData.totalSessions} />
                </Col>
                <Col span={4}>
                  <Statistic title="平均评分" value={perfData.avgRating?.toFixed(2) ?? '-'} />
                </Col>
                <Col span={4}>
                  <Statistic title="总消息数" value={perfData.totalMessages} />
                </Col>
                <Col span={4}>
                  <Statistic
                    title="平均首次响应"
                    value={perfData.avgFirstResponseTime ? `${Math.round(perfData.avgFirstResponseTime)}秒` : '-'}
                  />
                </Col>
                <Col span={4}>
                  <Statistic
                    title="平均解决时间"
                    value={perfData.avgResolutionTime ? `${Math.round(perfData.avgResolutionTime)}秒` : '-'}
                  />
                </Col>
                <Col span={4}>
                  <Statistic
                    title="平均消息/会话"
                    value={perfData.avgMessagesPerSession?.toFixed(1) ?? '-'}
                  />
                </Col>
              </Row>
              {chartOption && (
                <ReactECharts option={chartOption} style={{ height: 300 }} />
              )}
            </>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
