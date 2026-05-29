import React, { useState, useMemo } from 'react';
import {
  Card, Table, Tag, Space, Button, Switch, message, Modal, Form, Input,
  Popconfirm, Typography, Checkbox, Spin, Descriptions, Divider, Tooltip,
} from 'antd';
import {
  EditOutlined, UserOutlined, DeleteOutlined, SafetyOutlined,
  PlusOutlined, EyeOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchRoleList, addRole, editRole, deleteRole, fetchRoleUsers,
  fetchRolePagePerms, saveRolePagePerms, RoleItem, PagePerm,
} from '../api/permission';

const { Text } = Typography;

// ===== 页面权限配置：系统所有页面及其权限类型 =====
interface PagePermDef {
  path: string;
  label: string;
  category: string;
  // 权限类型：view=仅查看, op=查看+操作
  permType: 'view' | 'op';
}

const PAGE_PERM_DEFS: PagePermDef[] = [
  { path: '/', label: '客服运营首页', category: '概览', permType: 'view' },
  { path: '/satisfaction', label: '用户满意度', category: '概览', permType: 'op' },
  { path: '/udesc/votes', label: '评价分析', category: 'Udesk 数据分析', permType: 'op' },
  { path: '/udesc/metrics', label: '会话指标', category: 'Udesk 数据分析', permType: 'op' },
  { path: '/udesc/tickets', label: '工单分析', category: 'Udesk 数据分析', permType: 'op' },
  { path: '/udesc/heatmap', label: '时段热力图', category: 'Udesk 数据分析', permType: 'view' },
  { path: '/udesc/sessions', label: '咨询详情', category: 'Udesk 数据分析', permType: 'op' },
  { path: '/demand', label: '需求关单率汇总', category: '需求管理', permType: 'op' },
  { path: '/demand/requirements', label: '需求详情', category: '需求管理', permType: 'op' },
  { path: '/demand/bugs', label: 'Bug 详情', category: '需求管理', permType: 'op' },
  { path: '/opportunity', label: '商机管理', category: '业务', permType: 'op' },
  { path: '/sync-udesk', label: '数据同步（Udesk）', category: '系统管理', permType: 'op' },
  { path: '/sync-zouwu', label: '数据同步（驺吾）', category: '系统管理', permType: 'op' },
  { path: '/users', label: '人员管理', category: '系统管理', permType: 'op' },
  { path: '/logs', label: '系统日志', category: '系统管理', permType: 'view' },
  { path: '/access-control', label: '权限管理', category: '系统管理', permType: 'op' },
];

// 按分类分组
const PAGE_CATEGORIES = [...new Set(PAGE_PERM_DEFS.map(p => p.category))];

export function RoleManagePage() {
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [selectedRoleUsers, setSelectedRoleUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 页面权限配置相关
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permEditingRole, setPermEditingRole] = useState<RoleItem | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permMap, setPermMap] = useState<Record<string, { canView: boolean; canOp: boolean }>>({});

  // 角色详情预览
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRole, setDetailRole] = useState<RoleItem | null>(null);
  const [detailPerms, setDetailPerms] = useState<PagePerm[]>([]);
  const [detailUsers, setDetailUsers] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['permission-roles', pageNum, pageSize, keyword],
    queryFn: () => fetchRoleList({ pageNum, pageSize, keyword }),
  });

  // ===== 新增/编辑角色 =====
  const handleAdd = () => {
    setEditingRole(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };

  const handleEdit = (record: RoleItem) => {
    setEditingRole(record);
    form.setFieldsValue({
      roleName: record.roleName,
      roleDesc: record.roleDesc,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingRole) {
        await editRole({ ...values, roleId: editingRole.roleId });
        message.success('编辑成功');
      } else {
        await addRole(values);
        message.success('新增成功');
      }
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (roleId: number) => {
    try {
      await deleteRole(roleId);
      message.success('删除成功');
      queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  // ===== 查看关联用户 =====
  const handleViewUsers = async (record: RoleItem) => {
    setLoadingUsers(true);
    setUsersModalOpen(true);
    try {
      const users = await fetchRoleUsers(record.roleId);
      setSelectedRoleUsers(users);
    } catch {
      message.error('加载关联用户失败');
    } finally {
      setLoadingUsers(false);
    }
  };

  // ===== 页面权限配置 =====
  const handleConfigPerms = async (record: RoleItem) => {
    setPermEditingRole(record);
    setPermModalOpen(true);
    setPermLoading(true);
    // 初始化所有页面的权限为 false
    const initMap: Record<string, { canView: boolean; canOp: boolean }> = {};
    PAGE_PERM_DEFS.forEach(p => {
      initMap[p.path] = { canView: false, canOp: false };
    });
    try {
      const perms = await fetchRolePagePerms(record.roleId);
      perms.forEach(p => {
        if (initMap[p.pagePath]) {
          initMap[p.pagePath] = { canView: p.canView, canOp: p.canOp };
        }
      });
    } catch {
      // 未配置过权限，保持全 false
    }
    setPermMap(initMap);
    setPermLoading(false);
  };

  const handlePermChange = (path: string, field: 'canView' | 'canOp', checked: boolean) => {
    setPermMap(prev => {
      const current = prev[path];
      // 如果取消查看，同时取消操作
      if (field === 'canView' && !checked) {
        return { ...prev, [path]: { canView: false, canOp: false } };
      }
      // 如果勾选操作，自动勾选查看
      if (field === 'canOp' && checked) {
        return { ...prev, [path]: { canView: true, canOp: true } };
      }
      return { ...prev, [path]: { ...current, [field]: checked } };
    });
  };

  // 全选/取消全选某分类
  const handleCategoryCheckAll = (category: string, checked: boolean) => {
    setPermMap(prev => {
      const next = { ...prev };
      PAGE_PERM_DEFS.filter(p => p.category === category).forEach(p => {
        next[p.path] = { canView: checked, canOp: checked && p.permType === 'op' };
      });
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!permEditingRole) return;
    setPermSaving(true);
    try {
      const perms: PagePerm[] = PAGE_PERM_DEFS
        .map(p => ({
          pagePath: p.path,
          canView: permMap[p.path]?.canView ?? false,
          canOp: permMap[p.path]?.canOp ?? false,
        }))
        .filter(p => p.canView || p.canOp); // 只保存有权限的
      await saveRolePagePerms(permEditingRole.roleId, perms);
      message.success('页面权限配置保存成功');
      setPermModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    } finally {
      setPermSaving(false);
    }
  };

  // ===== 角色详情预览 =====
  const handleViewDetail = async (record: RoleItem) => {
    setDetailRole(record);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const [perms, users] = await Promise.all([
        fetchRolePagePerms(record.roleId),
        fetchRoleUsers(record.roleId),
      ]);
      setDetailPerms(perms);
      setDetailUsers(users);
    } catch {
      message.error('加载角色详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 统计角色权限概要
  const getPermSummary = (record: RoleItem) => {
    // 此处只能做粗略提示，精确数据需查询
    return `${record.userCount} 人`;
  };

  const columns = [
    {
      title: '角色ID',
      dataIndex: 'roleId',
      width: 80,
    },
    {
      title: '角色名称',
      dataIndex: 'roleName',
      width: 150,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '角色描述',
      dataIndex: 'roleDesc',
      width: 200,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '关联账号',
      dataIndex: 'userCount',
      width: 100,
      render: (count: number) => (
        <Tooltip title="点击查看关联用户">
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => handleViewUsers(data?.list.find((r: RoleItem) => r.userCount === count)!)}>
            {count} 人
          </Button>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: number) => (
        <Tag color={status ? 'green' : 'red'}>{status ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 170,
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right' as const,
      render: (_: unknown, record: RoleItem) => (
        <Space size="small">
          <Tooltip title="查看角色详情">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>详情</Button>
          </Tooltip>
          <Tooltip title="配置页面权限（查看/操作）">
            <Button size="small" type="primary" icon={<SafetyOutlined />} onClick={() => handleConfigPerms(record)}>权限</Button>
          </Tooltip>
          <Tooltip title="查看关联用户">
            <Button size="small" icon={<UserOutlined />} onClick={() => handleViewUsers(record)}>用户</Button>
          </Tooltip>
          <Tooltip title="编辑角色">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          </Tooltip>
          <Popconfirm
            title="确认删除该角色？"
            description={record.userCount > 0 ? '该角色已绑定用户，无法删除' : '删除后无法恢复'}
            onConfirm={() => handleDelete(record.roleId)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={record.userCount > 0}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ===== 渲染页面权限配置弹窗 =====
  const renderPermModal = () => {
    if (!permEditingRole) return null;

    return (
      <Modal
        title={
          <Space>
            <SafetyOutlined />
            <span>配置页面权限 - {permEditingRole.roleName}</span>
          </Space>
        }
        open={permModalOpen}
        onCancel={() => setPermModalOpen(false)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setPermModalOpen(false)}>取消</Button>,
          <Button key="save" type="primary" loading={permSaving} onClick={handleSavePerms}>保存</Button>,
        ]}
      >
        {permLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <div>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 6 }}>
              <Space>
                <KeyOutlined />
                <Text strong>权限说明</Text>
              </Space>
              <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                <div>• <Tag color="blue">查看</Tag> 可访问该页面，查看数据</div>
                <div>• <Tag color="green">操作</Tag> 可在该页面执行增删改等操作（自动包含查看权限）</div>
                <div>• 仅查看权限的页面，勾选"查看"即可；查看+操作权限的页面，可进一步勾选"操作"</div>
              </div>
            </div>

            {PAGE_CATEGORIES.map(category => {
              const pages = PAGE_PERM_DEFS.filter(p => p.category === category);
              const allViewChecked = pages.every(p => permMap[p.path]?.canView);
              const allOpChecked = pages.every(p => permMap[p.path]?.canOp);
              const someChecked = pages.some(p => permMap[p.path]?.canView || permMap[p.path]?.canOp);

              return (
                <div key={category} style={{ marginBottom: 16 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', padding: '8px 12px',
                    background: '#fafafa', borderRadius: '6px 6px 0 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}>
                    <Text strong style={{ flex: 1 }}>{category}</Text>
                    <Space size="middle">
                      <Checkbox
                        indeterminate={someChecked && !allViewChecked}
                        checked={allViewChecked}
                        onChange={e => handleCategoryCheckAll(category, e.target.checked)}
                      >
                        全部查看
                      </Checkbox>
                      {pages.some(p => p.permType === 'op') && (
                        <Checkbox
                          indeterminate={allViewChecked && !allOpChecked && pages.some(p => permMap[p.path]?.canOp)}
                          checked={allOpChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              pages.forEach(p => {
                                setPermMap(prev => ({
                                  ...prev,
                                  [p.path]: { canView: true, canOp: p.permType === 'op' ? true : prev[p.path]?.canOp ?? false },
                                }));
                              });
                            } else {
                              pages.forEach(p => {
                                setPermMap(prev => ({
                                  ...prev,
                                  [p.path]: { ...prev[p.path], canOp: false },
                                }));
                              });
                            }
                          }}
                        >
                          全部操作
                        </Checkbox>
                      )}
                    </Space>
                  </div>
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: '0 0 6px 6px' }}>
                    {pages.map((page, idx) => {
                      const perm = permMap[page.path] || { canView: false, canOp: false };
                      return (
                        <div
                          key={page.path}
                          style={{
                            display: 'flex', alignItems: 'center', padding: '10px 16px',
                            borderBottom: idx < pages.length - 1 ? '1px solid #f5f5f5' : 'none',
                            background: perm.canView ? (perm.canOp ? '#f6ffed' : '#e6f7ff') : '#fff',
                          }}
                        >
                          <Text style={{ flex: 1, fontSize: 13 }}>{page.label}</Text>
                          <Text code style={{ fontSize: 11, marginRight: 12 }}>{page.path}</Text>
                          <Space size="middle">
                            <Checkbox
                              checked={perm.canView}
                              onChange={e => handlePermChange(page.path, 'canView', e.target.checked)}
                            >
                              <Tag color={perm.canView ? 'blue' : 'default'} style={{ margin: 0 }}>
                                查看
                              </Tag>
                            </Checkbox>
                            {page.permType === 'op' && (
                              <Checkbox
                                checked={perm.canOp}
                                disabled={!perm.canView}
                                onChange={e => handlePermChange(page.path, 'canOp', e.target.checked)}
                              >
                                <Tag color={perm.canOp ? 'green' : 'default'} style={{ margin: 0 }}>
                                  操作
                                </Tag>
                              </Checkbox>
                            )}
                            {page.permType === 'view' && (
                              <Tooltip title="该页面仅支持查看权限">
                                <Tag color="default" style={{ opacity: 0.5 }}>仅查看</Tag>
                              </Tooltip>
                            )}
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    );
  };

  // ===== 渲染角色详情弹窗 =====
  const renderDetailModal = () => {
    if (!detailRole) return null;

    return (
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>角色详情 - {detailRole.roleName}</span>
          </Space>
        }
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={680}
        footer={null}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="角色ID">{detailRole.roleId}</Descriptions.Item>
              <Descriptions.Item label="角色名称">{detailRole.roleName}</Descriptions.Item>
              <Descriptions.Item label="角色描述" span={2}>{detailRole.roleDesc || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detailRole.status ? 'green' : 'red'}>{detailRole.status ? '启用' : '禁用'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="关联用户数">{detailUsers.length} 人</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 20 }}>
              <Space><SafetyOutlined /> 页面权限</Space>
            </Divider>
            {detailPerms.length === 0 ? (
              <Text type="secondary">暂未配置页面权限</Text>
            ) : (
              <div>
                {PAGE_CATEGORIES.map(category => {
                  const pages = PAGE_PERM_DEFS.filter(p => p.category === category);
                  const categoryPerms = detailPerms.filter(dp => pages.some(p => p.path === dp.pagePath));
                  if (categoryPerms.length === 0) return null;
                  return (
                    <div key={category} style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 13 }}>{category}</Text>
                      <div style={{ marginTop: 6 }}>
                        {pages.map(page => {
                          const perm = detailPerms.find(dp => dp.pagePath === page.path);
                          if (!perm) return null;
                          return (
                            <span key={page.path} style={{ display: 'inline-block', margin: '2px 4px' }}>
                              <Tag color={perm.canOp ? 'green' : perm.canView ? 'blue' : 'default'}>
                                {page.label}
                                {perm.canOp ? '（操作）' : perm.canView ? '（查看）' : ''}
                              </Tag>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Divider orientation="left" style={{ marginTop: 20 }}>
              <Space><UserOutlined /> 关联用户</Space>
            </Divider>
            {detailUsers.length === 0 ? (
              <Text type="secondary">暂无关联用户</Text>
            ) : (
              <Table
                dataSource={detailUsers}
                rowKey="userId"
                pagination={false}
                size="small"
                columns={[
                  { title: '用户ID', dataIndex: 'userId', width: 150 },
                  { title: '姓名', dataIndex: 'name', width: 120 },
                  { title: '部门', dataIndex: 'department', width: 150 },
                  { title: '职位', dataIndex: 'position', width: 150 },
                ]}
              />
            )}
          </div>
        )}
      </Modal>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input.Search
          placeholder="搜索角色名称/描述"
          style={{ width: 300 }}
          onSearch={(value) => { setKeyword(value); setPageNum(1); }}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增角色</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.list}
        rowKey="roleId"
        loading={isLoading}
        scroll={{ x: 1100 }}
        pagination={{
          current: pageNum,
          pageSize,
          total: data?.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p, ps) => { setPageNum(p); setPageSize(ps); },
        }}
      />

      {/* 新增/编辑角色弹窗 */}
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="roleName"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="roleDesc" label="角色描述">
            <Input.TextArea rows={3} placeholder="请输入角色描述" />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 关联用户弹窗 */}
      <Modal
        title="关联用户列表"
        open={usersModalOpen}
        onCancel={() => setUsersModalOpen(false)}
        footer={null}
        width={700}
      >
        {loadingUsers ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : selectedRoleUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <UserOutlined style={{ fontSize: 40, color: '#d9d9d9' }} />
            <div style={{ marginTop: 12, color: '#999' }}>暂无关联用户</div>
          </div>
        ) : (
          <Table
            dataSource={selectedRoleUsers}
            rowKey="userId"
            pagination={false}
            size="small"
            columns={[
              { title: '用户ID', dataIndex: 'userId', width: 150 },
              { title: '姓名', dataIndex: 'name', width: 120 },
              { title: '部门', dataIndex: 'department', width: 150 },
              { title: '职位', dataIndex: 'position', width: 150 },
            ]}
          />
        )}
      </Modal>

      {/* 页面权限配置弹窗 */}
      {renderPermModal()}

      {/* 角色详情弹窗 */}
      {renderDetailModal()}
    </div>
  );
}
