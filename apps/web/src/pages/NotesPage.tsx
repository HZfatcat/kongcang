import { useState, useEffect } from 'react';
import { Card, DatePicker, Table, Typography, Spin, Alert, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface NoteRecord {
  id: number;
  time: string;
  agent: string;
  customer: string;
  problemType1: string;
  problemType2: string;
  problemType3: string;
}

export function NotesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NoteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs('2026-05-26'),
    dayjs('2026-05-26'),
  ]);

  const columns: ColumnsType<NoteRecord> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '时间', dataIndex: 'time', key: 'time', width: 180 },
    { title: '客服', dataIndex: 'agent', key: 'agent', width: 100 },
    { title: '客户', dataIndex: 'customer', key: 'customer', width: 200, ellipsis: true },
    { title: '问题类型_1', dataIndex: 'problemType1', key: 'problemType1', width: 120 },
    { title: '问题类型_2', dataIndex: 'problemType2', key: 'problemType2', width: 160 },
    { title: '问题类型_3', dataIndex: 'problemType3', key: 'problemType3', width: 200, ellipsis: true },
  ];

  // 从后端加载业务记录
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: 对接后端 API /udesc/notes
      // const resp = await fetchUdescNotes({
      //   startDate: dateRange[0].format('YYYY-MM-DD'),
      //   endDate: dateRange[1].format('YYYY-MM-DD'),
      // });
      // setData(resp.records);
      // setTotal(resp.total);
      
      // 暂时使用 Python 脚本跑的示例数据
      setData(SAMPLE_DATA);
      setTotal(SAMPLE_DATA.length);
    } catch (err: any) {
      setError(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>业务记录</Title>
        <Text type="secondary">业务记录列表，问题类型按级联字段逐级展开</Text>
      </div>

      {/* 筛选区域 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
          allowClear={false}
        />
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          scroll={{ x: 1000 }}
          pagination={{
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
          }}
          size="small"
        />
      )}
    </div>
  );
}

// Python 脚本跑出来的示例数据（2026-05-26）
const SAMPLE_DATA: NoteRecord[] = [
  { id: 115201860, time: '2026-05-26T17:56:44', agent: '潘芳', customer: 'orbit-mirror', problemType1: '审核问题', problemType2: '审核不通过', problemType3: '含VPN' },
  { id: 115201688, time: '2026-05-26T17:55:05', agent: '潘芳', customer: '中国广西南宁电信(1779789258944)', problemType1: 'AI社区相关', problemType2: '模型仓使用咨询', problemType3: 'base url、api、mode id等参数如何填写' },
  { id: 115199998, time: '2026-05-26T17:40:08', agent: '段嘉雯', customer: 'xingzjz', problemType1: '功能异常与需求反馈', problemType2: '功能bug反馈', problemType3: '' },
  { id: 115199673, time: '2026-05-26T17:37:16', agent: '段嘉雯', customer: 'MousyCat', problemType1: '项目相关', problemType2: 'release相关', problemType3: '' },
  { id: 115199131, time: '2026-05-26T17:33:06', agent: '段嘉雯', customer: '189****0304', problemType1: '关于我们', problemType2: '商务合作', problemType3: '' },
  { id: 115198748, time: '2026-05-26T17:29:53', agent: '段嘉雯', customer: '中国广东东莞电信(1779787786822)', problemType1: '关于我们', problemType2: '商务合作', problemType3: '' },
  { id: 115198287, time: '2026-05-26T17:26:08', agent: '段嘉雯', customer: 'hunterhou', problemType1: '项目相关', problemType2: '流水线相关', problemType3: '我的项目为什么没有流水线' },
  { id: 115197183, time: '2026-05-26T17:17:48', agent: '段嘉雯', customer: 'Erwin_Wu', problemType1: '项目相关', problemType2: 'release相关', problemType3: '' },
  { id: 115195933, time: '2026-05-26T17:08:07', agent: '段嘉雯', customer: 'lichunxiang8', problemType1: '项目相关', problemType2: 'PR相关', problemType3: '门禁检查与CI流程问题' },
  { id: 115193938, time: '2026-05-26T16:52:48', agent: '潘芳', customer: 'orbit-mirror', problemType1: '', problemType2: '', problemType3: '' },
  { id: 115193830, time: '2026-05-26T16:51:52', agent: '潘芳', customer: '中国江苏南京移动(1779785478566)', problemType1: '项目相关', problemType2: '如何下载', problemType3: 'github镜像项目' },
  { id: 115191852, time: '2026-05-26T16:37:40', agent: '段嘉雯', customer: '中国广东深圳天威视讯(1779784638442)', problemType1: 'atomcode', problemType2: 'codingplan使用及容量限制', problemType3: '' },
  { id: 115191566, time: '2026-05-26T16:35:46', agent: '潘芳', customer: 'wangleijie', problemType1: '组织相关', problemType2: '如何邀请组织成员', problemType3: '' },
  { id: 115191465, time: '2026-05-26T16:35:05', agent: '段嘉雯', customer: '中国北京北京移动(1779784479176)', problemType1: '项目相关', problemType2: '项目搜索/推荐', problemType3: '代码仓' },
  { id: 115191072, time: '2026-05-26T16:32:32', agent: '段嘉雯', customer: '中国湖南长沙电信(1779784334282)', problemType1: 'atomcode', problemType2: 'codingplan领取问题', problemType3: '' },
  { id: 115188049, time: '2026-05-26T16:12:47', agent: '段嘉雯', customer: 'GGsimidadada', problemType1: '项目相关', problemType2: '推拉代码时的用户名密码是什么', problemType3: '' },
  { id: 115186841, time: '2026-05-26T16:04:54', agent: '潘芳', customer: 'author_Adley', problemType1: '项目相关', problemType2: 'PR相关', problemType3: 'PR合入问题' },
  { id: 115183033, time: '2026-05-26T15:39:00', agent: '段嘉雯', customer: 'a1296527277', problemType1: '项目相关', problemType2: 'PR相关', problemType3: '门禁检查与CI流程问题' },
  { id: 115182941, time: '2026-05-26T15:38:18', agent: '潘芳', customer: 'zhangqiongyan', problemType1: '项目相关', problemType2: 'PR相关', problemType3: 'PR审查设置' },
  { id: 115182665, time: '2026-05-26T15:36:25', agent: '段嘉雯', customer: '中国江苏苏州电信(1779780956913)', problemType1: 'atomcode', problemType2: '编辑器使用问题', problemType3: '' },
  { id: 115182592, time: '2026-05-26T15:35:59', agent: '潘芳', customer: 'l60099154', problemType1: '项目相关', problemType2: 'PR相关', problemType3: '其他' },
  { id: 115182127, time: '2026-05-26T15:33:08', agent: '段嘉雯', customer: 'wendellX', problemType1: 'AI社区相关', problemType2: 'token使用及容量限制', problemType3: '' },
  { id: 115181474, time: '2026-05-26T15:29:00', agent: '潘芳', customer: 'maerli', problemType1: 'AI社区相关', problemType2: 'notebook相关问题', problemType3: 'notebook免费使用时长' },
  { id: 115181133, time: '2026-05-26T15:26:41', agent: '段嘉雯', customer: '中国移动(1779780370964)', problemType1: 'atomcode', problemType2: 'codingplan领取问题', problemType3: '' },
  { id: 115179701, time: '2026-05-26T15:16:59', agent: '潘芳', customer: 'caixincen', problemType1: '项目相关', problemType2: 'PR相关', problemType3: 'PR审查设置' },
  { id: 115178382, time: '2026-05-26T15:07:48', agent: '潘芳', customer: 'twang1966', problemType1: '项目相关', problemType2: '项目本身问题使用咨询', problemType3: '开源工具包项目问题' },
  { id: 115178292, time: '2026-05-26T15:07:06', agent: '潘芳', customer: 'gcw_a30XA8nc', problemType1: '账号管理', problemType2: '注销账号', problemType3: '未告知原因' },
  { id: 115177581, time: '2026-05-26T15:02:10', agent: '段嘉雯', customer: 'Hana77', problemType1: '项目相关', problemType2: 'PR相关', problemType3: 'PR diff页使用疑问' },
  { id: 115174408, time: '2026-05-26T14:40:42', agent: '潘芳', customer: 'gcw_VFEc1Fs2', problemType1: '项目相关', problemType2: '如何下载', problemType3: '开源工具包项目' },
  { id: 115173595, time: '2026-05-26T14:35:44', agent: '潘芳', customer: 'gcw_VFEc1Fs2', problemType1: '项目相关', problemType2: '如何下载', problemType3: '开源工具包项目' },
];
