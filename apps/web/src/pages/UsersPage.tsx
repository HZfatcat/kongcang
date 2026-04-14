import React from 'react';
import { Card, Table, Typography, Tag, Space, Button, Modal, Form, Input, Select, Switch, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ResizableTable } from '../components/ResizableTable';

interface AgentProfile {
  agentId: string;
  displayName: string;
  team?: string;
  role?: string;
  enabled: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

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
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<AgentProfile | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // 获取客服人员列表
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await apiClient.get<AgentProfile[]>('/agents');
      return res.data;
    },
  });

  // 获取企微员工列表
  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['wecom-employee'],
    queryFn: async () => {
      const res = await apiClient.get<WecomEmployee[]>('/wecom-employee');
      return res.data;
    },
  });

  // 更新客服人员
  const updateAgent = useMutation({
    mutationFn: async (data: Partial<AgentProfile> & { agentId: string }) => {
      const res = await apiClient.patch<AgentProfile>(`/agents/${data.agentId}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      message.success('更新成功');
      setEditModalOpen(false);
      form.resetFields();
    },
    onError: () => {
      message.error('更新失败');
    },
  });

  const agentColumns = [
    {
      title: 'ID',
      dataIndex: 'agentId',
      key: 'agentId',
      width: 120,
      sorter: (a: AgentProfile, b: AgentProfile) => a.agentId.localeCompare(b.agentId),
    },
    {
      title: '姓名',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 120,
      sorter: (a: AgentProfile, b: AgentProfile) => a.displayName.localeCompare(b.displayName),
    },
    {
      title: '团队',
      dataIndex: 'team',
      key: 'team',
      width: 120,
      sorter: (a: AgentProfile, b: AgentProfile) => (a.team || '').localeCompare(b.team || ''),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      sorter: (a: AgentProfile, b: AgentProfile) => (a.role || '').localeCompare(b.role || ''),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      sorter: (a: AgentProfile, b: AgentProfile) => Number(a.enabled) - Number(b.enabled),
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: AgentProfile) => (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          编辑
        </Button>
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
  ];

  const handleEdit = (agent: AgentProfile) => {
    setEditingAgent(agent);
    form.setFieldsValue(agent);
    setEditModalOpen(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (editingAgent) {
        updateAgent.mutate({ ...values, agentId: editingAgent.agentId });
      }
    });
  };

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
        >
          <ResizableTable<AgentProfile>
            rowKey="agentId"
            dataSource={agents}
            columns={agentColumns}
            pagination={{
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onShowSizeChange: (_, size) => setPageSize(size),
              showTotal: (total) => `共 ${total} 条`,
            }}
            size="middle"
            loading={agentsLoading}
          />
        </Card>
      )}

      {activeTab === 'employees' && (
        <Card 
          title={<span style={{ fontWeight: 600 }}>企微员工管理</span>}
          style={{ borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
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

      <Modal
        title="编辑客服人员"
        open={editModalOpen}
        onOk={handleSave}
        onCancel={() => {
          setEditModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={updateAgent.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="team" label="团队">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Input />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
