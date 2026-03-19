from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from jose import JWTError, jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
import os

# ── 配置 ──────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"].replace("postgres://", "postgresql://", 1)
SECRET_KEY   = os.environ.get("SECRET_KEY", "change-this-in-production")
ALGORITHM    = "HS256"
TOKEN_DAYS   = 30

# 两个用户的密码，从环境变量读取
USERS = {
    "me": os.environ.get("PASSWORD_ME", "password1"),
    "gf": os.environ.get("PASSWORD_GF", "password2"),
}

# ── 数据库 ────────────────────────────────────────
engine        = create_engine(DATABASE_URL)
SessionLocal  = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base          = declarative_base()

class Record(Base):
    __tablename__ = "records"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(String, index=True)
    type       = Column(String)       # expense / income
    category   = Column(String)
    amount     = Column(Float)
    note       = Column(String)
    date       = Column(String)       # YYYY-MM-DD
    month      = Column(String)       # YYYY-MM
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# ── FastAPI ───────────────────────────────────────
app = FastAPI(title="Ledger API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id not in USERS:
            raise HTTPException(status_code=401, detail="无效 Token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 过期或无效")

# ── 路由 ──────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    expected = USERS.get(form.username)
    if not expected or expected != form.password:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return {"access_token": create_token(form.username), "token_type": "bearer"}

class RecordIn(BaseModel):
    type:     str
    category: str
    amount:   float
    note:     str
    date:     str
    month:    str

@app.get("/records")
def get_records(
    month: str,
    view_as: str = None,
    user: str    = Depends(get_current_user),
    db: Session  = Depends(get_db),
):
    # 允许查看对方数据（只读），但不能伪装成自己以外的人写数据
    target = view_as if (view_as and view_as in USERS) else user
    rows = (
        db.query(Record)
        .filter(Record.user_id == target, Record.month == month)
        .order_by(Record.created_at.desc())
        .all()
    )
    return rows

@app.post("/records")
def add_record(
    body: RecordIn,
    user: str    = Depends(get_current_user),
    db: Session  = Depends(get_db),
):
    r = Record(user_id=user, **body.dict())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r

@app.delete("/records/{record_id}")
def delete_record(
    record_id: int,
    user: str    = Depends(get_current_user),
    db: Session  = Depends(get_db),
):
    r = db.query(Record).filter(Record.id == record_id, Record.user_id == user).first()
    if not r:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(r)
    db.commit()
    return {"ok": True}