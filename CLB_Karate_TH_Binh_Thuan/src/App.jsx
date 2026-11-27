
import {useEffect,useMemo,useState} from 'react';
import {db,ready} from './supabase';

const today=()=>new Date().toLocaleDateString('en-CA');
const fmt=d=>d?new Date(d+'T00:00:00').toLocaleDateString('vi-VN'):'—';

const belts=[
  'Trắng','Vàng','Cam','Xanh lá','Xanh dương',
  'Tím','Nâu 0','Nâu 1','Nâu 2','Nâu 3','Đen','Khác'
];

const empty={
  full_name:'',
  birth_date:'',
  phone:'',
  class_name:'',
  belt:'Trắng',
  join_date:'',
  status:'Đang tập',
  notes:''
};

const loginEmail=u=>`${u.trim().toLowerCase()}@karate.invalid`;

const makeStudentCode=()=>{
  const id=crypto.randomUUID
    ?crypto.randomUUID().replaceAll('-','').slice(0,10)
    :Date.now().toString(36)+Math.random().toString(36).slice(2,8);

  return 'HS'+id.toUpperCase();
};

export default function App(){

const[session,S]=useState(null);
const[profile,P]=useState(null);
const[loading,L]=useState(true);

const[username,E]=useState('');
const[password,W]=useState('');
const[err,X]=useState('');

const[rows,R]=useState([]);
const[rowsLoading,RL]=useState(false);

const[marks,M]=useState({});
const[history,Hs]=useState({});
const[date,D]=useState(today());

const[q,Q]=useState('');
const[cls,C]=useState('');
const[status,F]=useState('');

const[modal,V]=useState(false);
const[edit,G]=useState(null);
const[form,H]=useState(empty);
const[savingStudent,SS]=useState(false);

const[tab,T]=useState('list');

const[feeMonth,FM]=useState(today().slice(0,7));
const[feeRows,FR]=useState([]);
const[feesLoading,FL]=useState(false);
const[creatingInvoices,CI]=useState(false);

const[payAmounts,PA]=useState({});
const[payMethods,PM]=useState({});
const[paying,Paying]=useState(null);

const[feeRate,FRATE]=useState(300000);
const[feeRateInput,FRI]=useState('300000');
const[savingFee,SF]=useState(false);

useEffect(()=>{
  if(!ready){
    L(false);
    return;
  }

  db.auth.getSession().then(({data,error})=>{
    if(error)X(error.message);
    S(data.session);
    L(false);
  });

  const{data:{subscription}}=db.auth.onAuthStateChange((_,s)=>{
    S(s);
    P(null);
    R([]);
  });

  return()=>subscription.unsubscribe();
},[]);

useEffect(()=>{
  if(session)loadProfile();
},[session?.user?.id]);

async function loadProfile(){
  const{data,error}=await db
    .from('profiles')
    .select('id,full_name,role')
    .eq('id',session.user.id)
    .maybeSingle();

  if(error){
    X('Lỗi tải hồ sơ tài khoản: '+error.message);
    P(null);
    return;
  }

  P(data||null);
}

async function loadRows(){
  RL(true);

  try{
    const[a,b,c]=await Promise.all([
      db.from('students')
        .select('*')
        .order('full_name'),

      db.from('attendance')
        .select('student_id,status,sessions!inner(session_date)')
        .eq('sessions.session_date',date),

      db.from('attendance')
        .select('student_id,status')
    ]);

    if(a.error||b.error||c.error){
      X((a.error||b.error||c.error).message);
      return;
    }

    R(a.data||[]);

    M(Object.fromEntries(
      (b.data||[]).map(x=>[x.student_id,x.status])
    ));

    const hist={};

    (c.data||[]).forEach(x=>{
      hist[x.student_id]??={
        present:0,
        absent:0,
        excused:0
      };

      if(x.status==='Có mặt')hist[x.student_id].present++;
      else if(x.status==='Vắng')hist[x.student_id].absent++;
      else if(x.status==='Có phép')hist[x.student_id].excused++;
    });

    Hs(hist);

  }finally{
    RL(false);
  }
}

useEffect(()=>{
  if(profile)loadRows();
},[date,profile?.id]);

useEffect(()=>{
  if(profile&&tab==='fees'){
    loadFeeSettings();
    loadFees();
  }
},[profile?.id,tab,feeMonth]);

async function loadFeeSettings(){
  const r=await db
    .from('tuition_settings')
    .select('monthly_fee')
    .eq('id',1)
    .maybeSingle();

  if(r.error){
    X('Lỗi tải mức học phí: '+r.error.message);
    return;
  }

  const n=Number(r.data?.monthly_fee||300000);

  FRATE(n);
  FRI(String(n));
}

async function loadFees(){
  FL(true);

  try{
    const first=feeMonth+'-01';

    const a=await db
      .from('tuition_invoices')
      .select('id,student_id,billing_month,amount_due')
      .eq('billing_month',first)
      .order('created_at');

    if(a.error){
      X('Lỗi tải hóa đơn: '+a.error.message);
      return;
    }

    const invoices=a.data||[];
    const ids=invoices.map(x=>x.student_id);

    const[st,pa]=await Promise.all([
      ids.length
        ?db.from('students')
          .select('id,full_name,class_name')
          .in('id',ids)
        :Promise.resolve({data:[],error:null}),

      invoices.length
        ?db.from('tuition_payments')
          .select('id,invoice_id,amount,payment_method,paid_at,note')
          .in('invoice_id',invoices.map(x=>x.id))
          .order('paid_at',{ascending:false})
        :Promise.resolve({data:[],error:null})
    ]);

    if(st.error||pa.error){
      X((st.error||pa.error).message);
      return;
    }

    const sm=Object.fromEntries(
      (st.data||[]).map(x=>[x.id,x])
    );

    const sums={};

    (pa.data||[]).forEach(p=>{
      sums[p.invoice_id]=
        (sums[p.invoice_id]||0)+Number(p.amount);
    });

    FR(invoices.map(x=>({
      ...x,
      student:sm[x.student_id],
      paid:sums[x.id]||0,
      payments:(pa.data||[]).filter(
        p=>p.invoice_id===x.id
      )
    })));

  }finally{
    FL(false);
  }
}

async function saveFeeRate(){
  X('');

  const n=Number(feeRateInput);

  if(!Number.isInteger(n)||n<1){
    X('Mức học phí phải là số nguyên dương.');
    return;
  }

  SF(true);

  try{
    const check=await db
      .from('tuition_settings')
      .select('id')
      .eq('id',1)
      .maybeSingle();

    if(check.error){
      X('Lỗi kiểm tra mức học phí: '+check.error.message);
      return;
    }

    let r;

    if(check.data){
      r=await db
        .from('tuition_settings')
        .update({
          monthly_fee:n,
          updated_at:new Date().toISOString()
        })
        .eq('id',1);
    }else{
      r=await db
        .from('tuition_settings')
        .insert({
          id:1,
          monthly_fee:n,
          updated_at:new Date().toISOString()
        });
    }

    if(r.error){
      X('Không lưu được mức học phí: '+r.error.message);
      return;
    }

    FRATE(n);
    FRI(String(n));

    X('Đã lưu mức học phí mới. Hóa đơn cũ được giữ nguyên.');

  }finally{
    SF(false);
  }
}

async function createInvoices(){
  if(creatingInvoices)return;

  X('');

  if(rowsLoading){
    X('Danh sách võ sinh đang tải. Vui lòng thử lại.');
    return;
  }

  if(!rows.length){
    X('Chưa có dữ liệu võ sinh.');
    return;
  }

  const active=rows.filter(
    s=>s.status==='Đang tập'
  );

  if(!active.length){
    X('Không có võ sinh đang tập để tạo học phí.');
    return;
  }

  if(!Number.isInteger(Number(feeRate))||feeRate<1){
    X('Mức học phí hiện tại không hợp lệ.');
    return;
  }

  CI(true);

  try{
    const first=feeMonth+'-01';

    const payload=active.map(s=>({
      student_id:s.id,
      billing_month:first,
      amount_due:feeRate
    }));

    const r=await db
      .from('tuition_invoices')
      .upsert(payload,{
        onConflict:'student_id,billing_month',
        ignoreDuplicates:true
      });

    if(r.error){
      X('Lỗi tạo học phí: '+r.error.message);
      return;
    }

    await loadFees();

    X(
      'Đã xử lý hóa đơn cho '+active.length+
      ' võ sinh. Hóa đơn đã tồn tại không bị thay đổi.'
    );

  }finally{
    CI(false);
  }
}

function monthAfter(month,offset){
  const[y,m]=month.split('-').map(Number);

  return new Date(y,m-1+offset,1)
    .toLocaleDateString('en-CA')
    .slice(0,7);
}

async function addPayment(invoice){
  if(paying)return;

  X('');

  const amount=Number(payAmounts[invoice.id]);
  const method=payMethods[invoice.id]||'cash';

  if(!Number.isInteger(amount)||amount<=0){
    X('Nhập số tiền thanh toán hợp lệ.');
    return;
  }

  Paying(invoice.id);

  try{
    const endMonth=monthAfter(feeMonth,35)+'-01';

    const existing=await db
      .from('tuition_invoices')
      .select('id,student_id,billing_month,amount_due')
      .eq('student_id',invoice.student_id)
      .gte('billing_month',feeMonth+'-01')
      .lte('billing_month',endMonth);

    if(existing.error){
      X(existing.error.message);
      return;
    }

    const byMonth=Object.fromEntries(
      (existing.data||[]).map(x=>[x.billing_month,x])
    );

    const paid={};

    if(existing.data?.length){
      const pr=await db
        .from('tuition_payments')
        .select('invoice_id,amount')
        .in('invoice_id',existing.data.map(x=>x.id));

      if(pr.error){
        X(pr.error.message);
        return;
      }

      (pr.data||[]).forEach(x=>{
        paid[x.invoice_id]=
          (paid[x.invoice_id]||0)+Number(x.amount);
      });
    }

    let remaining=amount;
    let lastMonth=feeMonth;
    const plan=[];

    for(let i=0;i<36&&remaining>0;i++){
      const month=monthAfter(feeMonth,i);
      const date=month+'-01';
      const inv=byMonth[date];

      const due=inv
        ?Number(inv.amount_due)
        :Number(feeRate);

      const already=inv
        ?(paid[inv.id]||0)
        :0;

      const left=Math.max(0,due-already);

      if(left>0){
        const part=Math.min(left,remaining);

        plan.push({
          month,
          date,
          invoice:inv||null,
          amount:part
        });

        remaining-=part;
        lastMonth=month;
      }
    }

    if(remaining>0){
      X('Số tiền vượt quá khả năng phân bổ trong 36 tháng. Chưa ghi nhận thanh toán.');
      return;
    }

    const missing=plan
      .filter(x=>!x.invoice)
      .map(x=>({
        student_id:invoice.student_id,
        billing_month:x.date,
        amount_due:feeRate
      }));

    if(missing.length){
      const cr=await db
        .from('tuition_invoices')
        .upsert(missing,{
          onConflict:'student_id,billing_month',
          ignoreDuplicates:true
        });

      if(cr.error){
        X('Lỗi tạo hóa đơn tháng tiếp theo: '+cr.error.message);
        return;
      }
    }

    const requiredDates=plan.map(x=>x.date);

    const refreshed=await db
      .from('tuition_invoices')
      .select('id,student_id,billing_month,amount_due')
      .eq('student_id',invoice.student_id)
      .in('billing_month',requiredDates);

    if(refreshed.error){
      X(refreshed.error.message);
      return;
    }

    const invoiceMap=Object.fromEntries(
      (refreshed.data||[]).map(x=>[x.billing_month,x])
    );

    const inserts=plan.map(x=>{
      const inv=invoiceMap[x.date];

      return {
        invoice_id:inv.id,
        amount:x.amount,
        payment_method:method,
        note:'Thu gộp từ '+feeMonth
      };
    });

    const r=await db
      .from('tuition_payments')
      .insert(inserts);

    if(r.error){
      X('Lỗi ghi nhận thanh toán: '+r.error.message);
      return;
    }

    PA(x=>({...x,[invoice.id]:''}));

    await loadFees();

    X(
      'Đã ghi nhận '+
      amount.toLocaleString('vi-VN')+
      'đ, phân bổ đến tháng '+lastMonth+'.'
    );

  }finally{
    Paying(null);
  }
}

async function login(e){
  e.preventDefault();
  X('');

  const clean=username.trim().toLowerCase();

  const authEmail=clean.includes('@')
    ?clean
    :loginEmail(clean);

  if(
    !clean.includes('@')&&
    !/^[a-z0-9._-]{3,30}$/.test(clean)
  ){
    X('Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    return;
  }

  const{error}=await db.auth.signInWithPassword({
    email:authEmail,
    password
  });

  if(error){
    X('Không đăng nhập được. Kiểm tra tên đăng nhập và mật khẩu.');
  }
}

async function save(e){
  e.preventDefault();

  if(savingStudent)return;

  X('');
  SS(true);

  try{
    const payload={
      ...form,
      birth_date:form.birth_date||null,
      join_date:form.join_date||null
    };

    let r;

    if(edit){
      r=await db
        .from('students')
        .update(payload)
        .eq('id',edit);
    }else{
      r=await db
        .from('students')
        .insert({
          ...payload,
          code:makeStudentCode()
        });
    }

    if(r.error){
      X('Không lưu được hồ sơ: '+r.error.message);
      return;
    }

    V(false);
    G(null);
    H(empty);

    await loadRows();

    X('Đã lưu hồ sơ võ sinh.');

  }finally{
    SS(false);
  }
}

async function mark(id,value){
  const s=rows.find(x=>x.id===id);

  if(!s)return;

  X('');

  const{data,error}=await db
    .from('sessions')
    .upsert({
      session_date:date,
      class_name:s.class_name||'Chưa phân lớp'
    },{
      onConflict:'session_date,class_name'
    })
    .select()
    .single();

  if(error){
    X(error.message);
    return;
  }

  const r=await db
    .from('attendance')
    .upsert({
      session_id:data.id,
      student_id:id,
      status:value
    },{
      onConflict:'session_id,student_id'
    });

  if(r.error){
    X(r.error.message);
  }else{
    M(x=>({...x,[id]:value}));
    await loadRows();
  }
}

async function deleteStudent(s){
  if(!confirm('Xóa hồ sơ '+s.full_name+'?'))return;

  const r=await db
    .from('students')
    .delete()
    .eq('id',s.id);

  if(r.error){
    X('Không xóa được: '+r.error.message);
    return;
  }

  X('Đã xóa hồ sơ.');
  await loadRows();
}

const classes=useMemo(
  ()=>[...new Set(
    rows.map(x=>x.class_name).filter(Boolean)
  )].sort(),
  [rows]
);

const filtered=rows.filter(s=>
  (!q||[
    s.full_name,
    s.phone,
    s.class_name
  ].some(v=>
    (v||'').toLocaleLowerCase('vi')
      .includes(q.toLocaleLowerCase('vi'))
  ))&&
  (!cls||s.class_name===cls)&&
  (!status||s.status===status)
);

if(!ready){
  return <div className="center">
    <section className="card">
      <h1>CLB Karate TH Bình Thuận</h1>
      <h2>Chưa cấu hình Supabase</h2>
      <p>
        Tạo file .env theo .env.example, điền Project URL
        và Publishable key. Không dùng Secret key ở trình duyệt.
      </p>
    </section>
  </div>;
}

if(loading){
  return <div className="center">Đang tải…</div>;
}

if(!session){
  return <div className="center">
    <form className="card login" onSubmit={login}>
      <div className="logo">空</div>
      <h1>CLB Karate TH Bình Thuận</h1>
      <p>Đăng nhập quản trị và huấn luyện viên</p>

      <label>
        Tên đăng nhập
        <input
          autoComplete="username"
          required
          value={username}
          onChange={e=>E(e.target.value)}
          placeholder="Ví dụ: admin"
        />
      </label>

      <label>
        Mật khẩu
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e=>W(e.target.value)}
        />
      </label>

      <button className="primary">Đăng nhập</button>

      {err&&<p className="error">{err}</p>}

      <small>Tài khoản do quản trị viên cấp.</small>
    </form>
  </div>;
}

if(!profile){
  return <div className="center">
    <section className="card">
      <h2>Tài khoản chưa được phân quyền</h2>
      <p>
        Quản trị viên cần thêm hồ sơ cho tài khoản
        trong bảng profiles.
      </p>
      <button onClick={()=>db.auth.signOut()}>
        Đăng xuất
      </button>
      {err&&<p className="error">{err}</p>}
    </section>
  </div>;
}

const statFor=id=>history[id]||{
  present:0,
  absent:0,
  excused:0
};

const pct=id=>{
  const h=statFor(id);
  const n=h.present+h.absent+h.excused;

  return n?Math.round(h.present/n*100):0;
};

const beltClass=b=>b?.startsWith('Nâu')?'brown':'';

const exportCSV=(filename,headers,data)=>{
  const csv='\uFEFF'+[
    headers,
    ...data
  ].map(r=>
    r.map(v=>
      '"'+String(v??'').replaceAll('"','""')+'"'
    ).join(',')
  ).join('\r\n');

  const a=document.createElement('a');
  const url=URL.createObjectURL(
    new Blob([csv],{type:'text/csv;charset=utf-8'})
  );

  a.href=url;
  a.download=filename;
  a.click();

  URL.revokeObjectURL(url);
};

return <>
<header>
  <div className="brand">
    <div className="logo">空</div>
    <div>
      <h1>CLB Karate TH Bình Thuận</h1>
      <small>HỆ THỐNG QUẢN LÝ VÕ SINH & ĐIỂM DANH</small>
    </div>
  </div>

  <div>
    {profile.full_name||session.user.email?.replace('@karate.invalid','')}
    {' · '}
    {profile.role==='admin'?'Quản trị viên':'Huấn luyện viên'}
    {' '}
    <button onClick={()=>db.auth.signOut()}>
      Đăng xuất
    </button>
  </div>
</header>

<main>
  <div className="top">
    <div>
      <small>BẢNG ĐIỀU KHIỂN</small>
      <h2>
        {tab==='list'
          ?'Quản lý hồ sơ võ sinh'
          :tab==='attendance'
          ?'Điểm danh buổi tập'
          :'Quản lý học phí'}
      </h2>
    </div>

    {tab==='list'&&
      <button
        className="primary"
        onClick={()=>{
          G(null);
          H(empty);
          X('');
          V(true);
        }}
      >
        ＋ Thêm võ sinh
      </button>
    }
  </div>

  {err&&<p className="error">{err}</p>}

  <div className="stats">
    <div className="card">
      Tổng võ sinh
      <b>{rows.length}</b>
    </div>

    <div className="card">
      Đang tập
      <b>{rows.filter(x=>x.status==='Đang tập').length}</b>
    </div>

    <div className="card">
      Số lớp
      <b>{classes.length}</b>
    </div>

    <div className="card">
      Có mặt ngày này
      <b>{markedCount()}</b>
    </div>
  </div>

  <nav>
    <button
      className={tab==='list'?'chosen':''}
      onClick={()=>T('list')}
    >
      Quản lý võ sinh
    </button>

    <button
      className={tab==='attendance'?'chosen':''}
      onClick={()=>T('attendance')}
    >
      Điểm danh
    </button>

    <button
      className={tab==='fees'?'chosen':''}
      onClick={()=>T('fees')}
    >
      Học phí
    </button>
  </nav>

  <section className="card">

    {tab!=='fees'&&
      <div className="filters">
        <input
          placeholder={
            tab==='list'
              ?'Tìm tên, số điện thoại…'
              :'Tìm tên võ sinh…'
          }
          value={q}
          onChange={e=>Q(e.target.value)}
        />

        <select
          value={cls}
          onChange={e=>C(e.target.value)}
        >
          <option value="">Tất cả lớp</option>
          {classes.map(x=>
            <option key={x}>{x}</option>
          )}
        </select>

        {tab==='list'&&
          <select
            value={status}
            onChange={e=>F(e.target.value)}
          >
            <option value="">Mọi trạng thái tập</option>
            {['Đang tập','Bảo lưu','Đã nghỉ'].map(x=>
              <option key={x}>{x}</option>
            )}
          </select>
        }

        {tab==='attendance'&&
          <label className="date-label">
            Ngày tập
            <input
              type="date"
              value={date}
              onChange={e=>D(e.target.value)}
            />
          </label>
        }
      </div>
    }

    {tab==='list'?<>
      <p className="section-note">
        Hồ sơ cá nhân, thông tin liên hệ, lớp và cấp đai.
        Điểm danh được quản lý ở mục riêng.
      </p>

      <div className="scroll">
        <table className="management-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ và tên</th>
              <th>Ngày sinh</th>
              <th>Số điện thoại</th>
              <th>Lớp</th>
              <th>Cấp đai</th>
              <th>Trạng thái tập</th>
              <th>Thao tác</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((s,i)=>
              <tr key={s.id}>
                <td>{i+1}</td>
                <td><b>{s.full_name}</b></td>
                <td>{fmt(s.birth_date)}</td>
                <td>{s.phone||'—'}</td>
                <td>{s.class_name||'—'}</td>
                <td>
                  <span className={'belt '+beltClass(s.belt)}>
                    {s.belt}
                  </span>
                </td>
                <td>
                  <span className={
                    'status-pill '+
                    (s.status==='Đang tập'
                      ?'active'
                      :s.status==='Bảo lưu'
                      ?'paused'
                      :'stopped')
                  }>
                    {s.status}
                  </span>
                </td>
                <td>
                  <button onClick={()=>{
                    G(s.id);
                    H({...empty,...s});
                    X('');
                    V(true);
                  }}>
                    Sửa
                  </button>

                  {' '}

                  <button
                    className="delete"
                    onClick={()=>deleteStudent(s)}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {rowsLoading&&<p>Đang tải danh sách…</p>}

        {!filtered.length&&!rowsLoading&&
          <p className="empty">
            Chưa có võ sinh. Nhấn “Thêm võ sinh” để bắt đầu.
          </p>
        }
      </div>

      <div className="bottom">
        <button onClick={()=>
          exportCSV(
            'Ho_so_vo_sinh.csv',
            ['Họ tên','Ngày sinh','Điện thoại','Lớp','Đai','Trạng thái'],
            filtered.map(s=>[
              s.full_name,
              s.birth_date,
              s.phone,
              s.class_name,
              s.belt,
              s.status
            ])
          )
        }>
          Xuất hồ sơ CSV
        </button>

        <button onClick={()=>print()}>
          In hồ sơ
        </button>

        <span>{filtered.length}/{rows.length} võ sinh</span>
      </div>

    </>:tab==='attendance'?<>
      <p className="section-note">
        Chọn trạng thái cho từng võ sinh trong buổi tập đã chọn.
        Thống kê chuyên cần được tính từ các lần điểm danh đã lưu.
      </p>

      <div className="attendance-summary">
        <div>
          <b>{marked.filter(x=>x==='Có mặt').length}</b>
          <span>Có mặt</span>
        </div>

        <div>
          <b>{marked.filter(x=>x==='Vắng').length}</b>
          <span>Vắng</span>
        </div>

        <div>
          <b>{marked.filter(x=>x==='Có phép').length}</b>
          <span>Có phép</span>
        </div>

        <div>
          <b>{rows.length-marked.length}</b>
          <span>Chưa điểm danh</span>
        </div>
      </div>

      <div className="scroll">
        <table className="attendance-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ và tên</th>
              <th>Lớp</th>
              <th>Cấp đai</th>
              <th>Điểm danh buổi này</th>
              <th>Chuyên cần</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((s,i)=>{
              const h=statFor(s.id);
              const p=pct(s.id);

              return <tr key={s.id}>
                <td>{i+1}</td>
                <td><b>{s.full_name}</b></td>
                <td>{s.class_name||'—'}</td>
                <td>
                  <span className={'belt '+beltClass(s.belt)}>
                    {s.belt}
                  </span>
                </td>
                <td>
                  <select
                    className={
                      'attendance-select '+
                      (marks[s.id]==='Có mặt'
                        ?'present'
                        :marks[s.id]==='Vắng'
                        ?'absent'
                        :marks[s.id]==='Có phép'
                        ?'excused'
                        :'unmarked')
                    }
                    value={marks[s.id]||''}
                    onChange={e=>
                      e.target.value&&mark(s.id,e.target.value)
                    }
                  >
                    <option value="">Chưa điểm danh</option>
                    {['Có mặt','Vắng','Có phép'].map(x=>
                      <option key={x}>{x}</option>
                    )}
                  </select>
                </td>
                <td>
                  <div className="attendance-history">
                    <b>{p}%</b>
                    <span>
                      Có {h.present} · Vắng {h.absent} · Phép {h.excused}
                    </span>
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>

        {!filtered.length&&
          <p className="empty">Không có võ sinh phù hợp.</p>
        }
      </div>

      <div className="bottom">
        <span>{filtered.length} võ sinh trong danh sách điểm danh</span>
      </div>

    </>:<>
      <div className="filters">
        <label className="date-label">
          Tháng thu học phí
          <input
            type="month"
            value={feeMonth}
            onChange={e=>FM(e.target.value)}
          />
        </label>

        <button
          className="primary"
          disabled={creatingInvoices||feesLoading||rowsLoading}
          onClick={createInvoices}
        >
          {creatingInvoices
            ?'Đang tạo…'
            :'＋ Tạo học phí tháng này'}
        </button>
      </div>

      <div className="fee-settings">
        <label>
          Mức học phí mỗi tháng (VNĐ)
          <input
            type="number"
            min="1"
            step="1000"
            value={feeRateInput}
            onChange={e=>FRI(e.target.value)}
          />
        </label>

        <button
          disabled={savingFee}
          onClick={saveFeeRate}
        >
          {savingFee?'Đang lưu…':'Lưu mức học phí'}
        </button>
      </div>

      <p className="section-note">
        Có thể thu 1, 2 tháng, theo quý (3 tháng) hoặc nhiều tháng cùng lúc.
        Nhập tổng số tiền; hệ thống tự phân bổ lần lượt vào từng tháng.
        Ví dụ 600.000đ = 2 tháng nếu mức thu là 300.000đ/tháng.
        Mức mới chỉ áp dụng cho hóa đơn tạo sau này;
        hóa đơn cũ giữ nguyên.
      </p>

      <div className="attendance-summary">
        <div>
          <b>{feeRows.length}</b>
          <span>Khoản thu</span>
        </div>

        <div>
          <b>
            {feeRows.reduce((n,x)=>n+x.paid,0).toLocaleString('vi-VN')}đ
          </b>
          <span>Đã thu</span>
        </div>

        <div>
          <b>
            {feeRows.reduce(
              (n,x)=>n+Math.max(0,x.amount_due-x.paid),0
            ).toLocaleString('vi-VN')}đ
          </b>
          <span>Còn nợ</span>
        </div>

        <div>
          <b>
            {feeRows.filter(x=>x.paid>=x.amount_due).length}
          </b>
          <span>Đã đóng đủ</span>
        </div>
      </div>

      <div className="scroll">
        <table className="management-table">
          <thead>
            <tr>
              <th>Võ sinh</th>
              <th>Lớp</th>
              <th>Phải đóng</th>
              <th>Đã đóng</th>
              <th>Còn nợ</th>
              <th>Trạng thái</th>
              <th>Ghi nhận thanh toán</th>
            </tr>
          </thead>

          <tbody>
            {feeRows.map(x=>{
              const left=Math.max(0,x.amount_due-x.paid);

              return <tr key={x.id}>
                <td>
                  <b>{x.student?.full_name||'Võ sinh đã xóa'}</b>

                  {x.payments.length>0&&
                    <div className="fee-history">
                      {x.payments.map(p=>
                        <small key={p.id}>
                          {fmt(p.paid_at)} ·
                          {' '}
                          {Number(p.amount).toLocaleString('vi-VN')}đ ·
                          {' '}
                          {p.payment_method==='cash'
                            ?'Tiền mặt'
                            :'Chuyển khoản'}
                        </small>
                      )}
                    </div>
                  }
                </td>

                <td>{x.student?.class_name||'—'}</td>
                <td>{Number(x.amount_due).toLocaleString('vi-VN')}đ</td>
                <td>{x.paid.toLocaleString('vi-VN')}đ</td>
                <td>{left.toLocaleString('vi-VN')}đ</td>

                <td>
                  <span className={
                    'status-pill '+
                    (left===0
                      ?'active'
                      :x.paid>0
                      ?'paused'
                      :'stopped')
                  }>
                    {left===0
                      ?'Đã đóng'
                      :x.paid>0
                      ?'Đóng một phần'
                      :'Chưa đóng'}
                  </span>
                </td>

                <td>
                  {left>0?
                    <div className="fee-pay">
                      <input
                        aria-label="Số tiền"
                        type="number"
                        min="1"
                        placeholder="Số tiền (có thể nhiều tháng)"
                        value={payAmounts[x.id]||''}
                        onChange={e=>
                          PA(v=>({...v,[x.id]:e.target.value}))
                        }
                      />

                      <select
                        value={payMethods[x.id]||'cash'}
                        onChange={e=>
                          PM(v=>({...v,[x.id]:e.target.value}))
                        }
                      >
                        <option value="cash">Tiền mặt</option>
                        <option value="transfer">Chuyển khoản</option>
                      </select>

                      <button
                        disabled={paying!==null}
                        onClick={()=>addPayment(x)}
                      >
                        {paying===x.id?'Đang lưu…':'Lưu'}
                      </button>
                    </div>
                    :<span>Hoàn tất</span>
                  }
                </td>
              </tr>;
            })}
          </tbody>
        </table>

        {feesLoading&&<p>Đang tải học phí…</p>}

        {!feeRows.length&&!feesLoading&&
          <p className="empty">
            Chưa có khoản học phí cho tháng này.
            Nhấn “Tạo học phí tháng này”.
          </p>
        }
      </div>

      <div className="bottom">
        <span>
          {feeRows.length} khoản học phí · {feeMonth}
        </span>

        <button onClick={()=>
          exportCSV(
            'Hoc_phi_'+feeMonth+'.csv',
            [
              'Võ sinh',
              'Lớp',
              'Tháng',
              'Phải đóng',
              'Đã đóng',
              'Còn nợ',
              'Trạng thái'
            ],
            feeRows.map(x=>[
              x.student?.full_name,
              x.student?.class_name,
              feeMonth,
              x.amount_due,
              x.paid,
              Math.max(0,x.amount_due-x.paid),
              x.paid>=x.amount_due
                ?'Đã đóng'
                :x.paid
                ?'Đóng một phần'
                :'Chưa đóng'
            ])
          )
        }>
          Xuất học phí CSV
        </button>
      </div>
    </>}

  </section>

  <footer>
    CLB Karate TH Bình Thuận · Dữ liệu lưu trực tuyến
  </footer>
</main>

{modal&&
  <div className="overlay">
    <form className="modal card" onSubmit={save}>
      <h2>
        {edit?'Chỉnh sửa hồ sơ võ sinh':'Thêm võ sinh'}
      </h2>

      <div className="grid">
        {[
          ['full_name','Họ và tên *','text'],
          ['birth_date','Ngày sinh','date'],
          ['phone','Số điện thoại','tel'],
          ['class_name','Lớp','text'],
          ['join_date','Ngày nhập học','date'],
          ['notes','Ghi chú','text']
        ].map(([k,l,t])=>
          <label key={k}>
            {l}
            <input
              type={t}
              required={k==='full_name'}
              value={form[k]||''}
              onChange={e=>
                H({...form,[k]:e.target.value})
              }
            />
          </label>
        )}

        <label>
          Cấp đai
          <select
            value={form.belt}
            onChange={e=>H({...form,belt:e.target.value})}
          >
            {belts.map(x=>
              <option key={x}>{x}</option>
            )}
          </select>
        </label>

        <label>
          Trạng thái tập luyện
          <select
            value={form.status}
            onChange={e=>H({...form,status:e.target.value})}
          >
            {['Đang tập','Bảo lưu','Đã nghỉ'].map(x=>
              <option key={x}>{x}</option>
            )}
          </select>
        </label>
      </div>

      <div className="actions">
        <button
          type="button"
          onClick={()=>V(false)}
        >
          Hủy
        </button>

        <button
          className="primary"
          disabled={savingStudent}
        >
          {savingStudent?'Đang lưu…':'Lưu hồ sơ'}
        </button>
      </div>
    </form>
  </div>
}

</>;

function markedCount(){
  return Object.values(marks).filter(x=>x==='Có mặt').length;
}

}
