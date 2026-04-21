import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Spin, message, Input, Space, Button, Modal, Descriptions } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { fetchUdescCustomers, fetchUdescCustomerDetail } from '../api/udesc';
import type { UdescCustomer, UdescCustomerListResp } from '../types/udesc';

export function CustomersPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UdescCustomerListResp | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<UdescCustomer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await fetchUdescCustomers({
        page,
        pageSize,
        search: search || undefined,
      });
      setData(resp);
    } catch {
      message.error('加载客户数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, search]);

  const showDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const resp = await fetchUdescCustomerDetail(id);
      setDetailData(resp);
    } catch {
      message.error('加载客户详情失败');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<UdescCustomer> = [
    {
      title: '客户ID',
      dataIndex: 'id',
      width: 120,
      ellipsis: true,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (name: string | null) => name || '-',
    },
    {
      title: '手机',
      dataIndex: 'phone',
      width: 140,
      render: (phone: string | null) => phone || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 180,
      ellipsis: true,
      render: (email: string | null) => email || '-',
    },
    {
      title: '微信',
      dataIndex: 'wechat',
      width: 120,
      render: (wechat: string | null) => wechat || '-',
    },
    {
      title: '企业',
      dataIndex: 'enterprise',
      width: 150,
      ellipsis: true,
      render: (e: string | null) => e || '-',
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 150,
      render: (tags: string[]) => tags?.length > 0 ? tags.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>) : '-',
    },
    {
      title: '同步时间',
      dataIndex: 'syncedAt',
      width: 180,
      render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => showDetail(record.id)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>客户管理</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Input.Search
            placeholder="搜索姓名/手机/邮箱"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            style={{ width: 300 }}
            enterButton
          />
        </Space>
      </Card>

      <Card>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data?.records ?? []}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            scroll={{ x: 1200 }}
          />
        </Spin>
      </Card>

      <Modal
        title="客户详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
      >
        <Spin spinning={detailLoading}>
          {detailData && (
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="ID">{detailData.id}</Descriptions.Item>
              <Descriptions.Item label="姓名">{detailData.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="手机">{detailData.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detailData.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="微信">{detailData.wechat || '-'}</Descriptions.Item>
              <Descriptions.Item label="企业">{detailData.enterprise || '-'}</Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                {detailData.tags?.length > 0
                  ? detailData.tags.map((t) => <Tag key={t}>{t}</Tag>)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="自定义字段" span={2}>
                {detailData.customFields
                  ? JSON.stringify(detailData.customFields)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="同步时间">
                {dayjs(detailData.syncedAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
