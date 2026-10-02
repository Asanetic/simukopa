'use client';

import React, { useEffect, useState , useRef  } from 'react';
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import {MosyFilterEngine, MosySecureFilterEngine} from "../DataControl/MosyFilterEngine";
import { mosyPostFormData, mosyGetData, mosyUpdateUrlParam, mosyUrlParam, magicRandomStr, mosySetLSData, mosyGetLSData, deleteUrlParam, mosyFormatDateOnly, mosyFormatDateTime, magicTrimText, mosyTogglePassword, mosyFileUrl } from '../../MosyUtils/hiveUtils';

import {MosyCard, closeMosyCard } from "../../components/MosyCard";   

import { mosyInputProps, mosyCellClass } from './formControlEngine';
import { MosyExtendLiveSearch } from './customUI';
import { useBillingAccountStatus } from '../../mosybilling/BillingMonitor';
import { PremiumDataBtn } from '../../mosybilling/PremuimBtn';

import { hiveRoutes } from '../../appConfigs/hiveRoutes';
import { useDropdownNavigation } from '../AppCore/appGlobalUtils';
import { createPortal } from 'react-dom';

const DEFAULT_BASE = hiveRoutes.hiveBaseRoute; // default root if none passed

function isComponentEnabled(tblName, actionType = 'cu') {
 // console.log(`isComponet enabledddddddddd ${tblName} --- ${actionType}`)
  const disabledDeleteTables = ["device_list","system_role_bundles", "system_users"];
  
  const [action, table] = tblName.includes(':') ? tblName.split(':') : [actionType, tblName];

  if (action === "delete" && disabledDeleteTables.includes(table)) {
    return false;
  }

  if (actionType === "delete" && disabledDeleteTables.includes(tblName)) {
    return false;
  }

  if (action === "add_new" && disabledDeleteTables.includes(table)) {
    return false;
  }

  if (action === "clone" && disabledDeleteTables.includes(table)) {
    return false;
  }

  if (action === "paginate" && disabledDeleteTables.includes(table)) {
    return false;
  }
  
  //disable edit and delete for DevicelistMainProfilePage table
  if(tblName=="sales_order_payments" && action!="DDdelete"){return false}

  //disable edit and delete for sale_order_payments table
  if(tblName=="sales_order_items" && action!="DDedit"){return false}
  if(tblName=="sales_order_items" && action!="DDdelete"){return false}

  if(tblName=="FarmersMainProfilePage" && action!="DDedit")
  {
    return false
  }

  if(tblName=="SmsmessagesMainProfilePage" && action!="DDedit")
  {
    return false
  }

  if(tblName=="SmsmessagesList" && action==="add_new")
  {
    return false
  }

  return true;
}


export  function DeleteButton({src, tblName, uptoken, stateItemSetters, parentStateSetters, router = null, onDelete}) {
  if (!uptoken) return null;

  const handleClick = () => {
    // You can override delete logic if needed
    if (typeof onDelete === "function") {
      onDelete(uptoken, { childStateSetters: stateItemSetters, parentStateSetters}, router);
    } else {
      // Fallback to global dialog handler
      popDeleteDialog(uptoken, {
        childStateSetters: stateItemSetters,
        parentStateSetters: parentStateSetters,
      });
    }
  };
  const billingStatus = useBillingAccountStatus();
  //  Don't render buttons if billing is not active
  if (billingStatus !== "Active") {
    return <PremiumDataBtn  buttonName='Manage data'/>;
  }

  if(!isComponentEnabled(src,"delete"))
  {
    return null
  }

  return (
    <button
      type="button"
      className="medium_btn border border-danger text-danger p-2 mr-3 ml-1 mb-3 hive_profile_nav_del_btn"
      onClick={handleClick}
    >
      <i className="fa fa-trash"></i> Delete
    </button>
  );
}


export function SubmitButtons({src, tblName, extraClass = '' }) {
  const searchParams = useSearchParams();
  const isUpdate = searchParams.has(`${tblName}_dataNode`);

  function handleCloneClick(e) {
    const actionInput = document.getElementById(`${tblName}_mosy_action`);
    if (actionInput) {
      actionInput.value = `add_${tblName}`;
    }
  }

  const billingStatus = useBillingAccountStatus();
  //  Don't render buttons if billing is not active
  if (billingStatus !== "Active") {
    return <PremiumDataBtn  buttonName='Manage data'/>;
  }

  const isCloneEnabled = isComponentEnabled(src, "clone")
  const isButtontEnabled = isComponentEnabled(src, "submit")

  if(!isButtontEnabled)
  {
    return null
  }

  return (
    <>
      {isUpdate ? (
        <>
          <button
            type="submit"
            id={`mp${tblName}_update_btn`}
            name={`mp${tblName}_update_btn`}
            className="btn btn-primary"
          >
            <i className="fa fa-save"></i> Save Changes
          </button>

         {isCloneEnabled &&(
          <button
            type="submit"
            id={`mp${tblName}_insert_btn`}
            name={`mp${tblName}_insert_btn`}
            className={`ml-lg-3 ${extraClass} mt-lg-0 mt-4 btn border border_set text-dark`}
            onClick={handleCloneClick}
          >
            <i className="fa fa-copy"></i> Clone Record
          </button>
         )}
        </>
      ) : (
        <button
          type="submit"
          id={`mp${tblName}_insert_btn`}
          name={`mp${tblName}_insert_btn`}
          className="btn btn-primary"
        >
          <i className="fa fa-check"></i> Proceed
        </button>
      )}
    </>
  );
}



// Add New Button
export function AddNewButton({src, link, label, icon = 'plus', className = 'medium_btn btn-primary border border_set hive_profile_add_new_btn p-2 ml-1 mr-1 ' }) {

  const billingStatus = useBillingAccountStatus();
  //  Don't render buttons if billing is not active
  if (billingStatus !== "Active") {
    return <PremiumDataBtn  buttonName='Add new'/>;
  }

  if(!isComponentEnabled(src,"add_new"))
    {
      return null
    }  
  return (
    <a href={link} className={className}>
      <i className={`fa fa-${icon}`}></i> {label}
    </a>
  );
}

// File Upload
export function MosyFileUploadButton({ tblName, attribute }) {
  if (!isComponentEnabled(tblName, 'upload')) return null;

  const fileId = `file${tblName}_${attribute}`;
  const fileLabelId = `file_name_${tblName}_${attribute}`;

  return (
    <div className="col-md-12 pt-3 p-0">
      <em id={fileLabelId} className="trim_text badge"></em>
      <label className="text-primary border border_set cpointer medium_btn pr-3 pl-3 bg-white">
        <i className="fa fa-upload mr-2"></i> Choose File
        <input
          type="file"
          id={fileId}
          name={fileId}
          style={{ display: 'none' }}
          onChange={(e) => {
            const val = e.target.value.replace('C:\\fakepath\\', '');
            document.getElementById(fileLabelId).innerText = val;
          }}
        />
      </label>
    </div>
  );
}


export function MosySmartDropdownActions({ tblName, attributes = '', callBack = () => {}, setters={}}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dataKey, profileUrl = '', skipEdit] = attributes.split(':');
  const token = btoa(dataKey);

  const getMergedUrl = (isDelete = false) => {
    let baseUrl = profileUrl?.trim();

    // Build query string
    const params = new URLSearchParams(
      baseUrl ? '' : searchParams.toString() // Only use current params if profileUrl is blank
    );

    params.set(`${tblName}_dataNode`, token);
    if (isDelete) {
      params.set(`${tblName}_delete`, '0');
    }

    const finalBase = baseUrl || pathname;
    return `${finalBase}?${params.toString()}`;
  };

  const handleEdit = () => {
    const url = getMergedUrl(false);
  
    if (!profileUrl?.trim()) {
      // If profileUrl is null or empty, reload the current page with the new query
      //window.location.href = url; // This forces a full page reload
      callBack({
        qstr:`where primkey='${dataKey}'`,
        actionType: `select`,
        actionName : `select_${tblName}`,
        token: dataKey,
        profile : profileUrl,
        url : url,
        router : router,
        setters : setters
      })

      //router.push(url);
      //router.push(url, { scroll: false });

    } else {
      // If profileUrl is defined, do a soft navigation
      callBack({
        qstr:`where primkey='${dataKey}'`,
        actionType: `select`,
        actionName : `select_${tblName}`,
        token: dataKey,
        profile : profileUrl ,
        url : url,
        router : router,
        setters : setters
       
      })

      ///router.push(url);
      //router.push(url, { scroll: false });
    }
  };

  const handleDelete = () => {
    const url = getMergedUrl(true);
  
    if (!profileUrl?.trim()) {
      //window.location.href = url;
      //mosyUpdateUrlParam()
      callBack({
        qstr:`where primkey='${dataKey}'`,
        actionType: `delete`,
        actionName : `delete_${tblName}`,
        token: dataKey,
        profile : profileUrl ,
        url : url,
        router : router,
        setters : setters
       
      })      
      //router.push(url);
      //router.push(url, { scroll: false });

    } else {
      
      callBack({
        qstr:`where primkey='${dataKey}'`,
        actionType: `delete`,
        actionName : `delete_${tblName}`,
        token: dataKey,
        profile : profileUrl ,
        url : url,
        router : router ,
        setters : setters   
      }) 
      
      //router.push(url);
      //router.push(url, { scroll: false });

    }
  };

  let  deleteBtn =       
  (<a className="mosy_msdn cpointer" onClick={handleDelete}>
    <i className="fa fa-trash"></i> Delete
  </a>)

  let editBtn = (
        <a className="mosy_msdn cpointer" onClick={handleEdit}>
        <i className="fa fa-edit"></i> View more
      </a>)

  
  const enabledStatus = 'Enabled'; // Or your real toggle logic
  if (enabledStatus !== 'Enabled') return null;

  const canEdit = isComponentEnabled(tblName, 'DDedit');
  const canDelete = isComponentEnabled(tblName, 'DDdelete');

  if(!canEdit){
    editBtn =null
  }
  if(!canDelete){
    deleteBtn =null
  }

  return (
    <>
    {editBtn}
    {deleteBtn}

    </>
  );

}

export function MosyGridRowOptions({
  source="",
  label = 'View',
  icon = 'edit',
  action="",
  dataIn = {},   // can be value OR function
  className = '',
  callBack = () => {},
}) {
  const handleClick = () => {
    const value = typeof dataIn === 'function' ? dataIn() : dataIn;
    if (typeof callBack === 'function') {
      callBack(value);
    }
  };
  const renderBtn = isComponentEnabled("action", action);

  if(!renderBtn){

    return null
  }

  return (
    <a className={`mosy_msdn cpointer ${className}`} onClick={handleClick}>
      {icon && <i className={`fa fa-${icon} mr-1`}></i>} {label}
    </a>
  );
}


export function MosyImageViewer({
  media,
  defaultLogo,
  imageClass = "rounded_avatar",
  forceImg = false,
  defaultSize = "",
}) {

  const borderStyle_ = defaultSize ? "" : "border";

  const apiMedia = `${DEFAULT_BASE}${media}`;

  const isMediaAvailable =
    apiMedia &&
    typeof apiMedia === "string" &&
    apiMedia.trim() !== "" &&
    !apiMedia.trim().endsWith("?media=");

  const isQueryPath = isMediaAvailable && media.includes("?media=");

  const finalMediaPath = isQueryPath
    ? apiMedia
    : isMediaAvailable
    ? `/storage/${media}`
    : defaultLogo;

  // 🔥 NEW: metadata state
  const [fileMeta, setFileMeta] = useState({
    name: "",
    ext: "",
    type: "",
    loaded: false,
  });

  // 🚀 Fetch headers ONLY (lightweight)
  useEffect(() => {
    if (!isMediaAvailable) return;

    fetch(finalMediaPath, { method: "HEAD" }) // ⚡ HEAD = no file download
      .then((res) => {
        const name = decodeURIComponent(res.headers.get("X-File-Name") || "");
        const ext = res.headers.get("X-File-Ext") || "";
        const type = res.headers.get("X-File-Type") || "";

        setFileMeta({
          name,
          ext,
          type,
          loaded: true,
        });
      })
      .catch(() => {
        setFileMeta((prev) => ({ ...prev, loaded: true }));
      });
  }, [finalMediaPath]);

  const handleImageClick = (path) => {
    MosyCard("", <MosyImageViewer media={apiMedia} imageClass="product_image" />);
  };

  // 🔥 Derived types (no guessing anymore)
  const isImage = fileMeta.type.startsWith("image/");
  const isPDF = fileMeta.type === "application/pdf";

  // 🖼️ IMAGE
  if (isMediaAvailable && isImage) {
    return (
      <img
        src={finalMediaPath}
        onClick={() => handleImageClick(finalMediaPath)}
        className={`cpointer ${borderStyle_} ${imageClass}`}
        alt={fileMeta.name || "image"}
      />
    );
  }

  // 📄 PDF (inline preview)
  // if (isMediaAvailable && isPDF) {
  //   return (
  //     <iframe
  //       src={finalMediaPath}
  //       style={{ width: "100%", height: "400px", borderRadius: "10px" }}
  //       title={fileMeta.name}
  //     />
  //   );
  // }

  const getIcon = (type) => {
    if (type.includes("pdf")) return "fa-file-text";
    if (type.includes("word")) return "fa-copy";
    if (type.includes("excel")) return "fa-file-text text-success";
    return "fa-paperclip";
  };

  if (isMediaAvailable && fileMeta.loaded && !isImage && !forceImg) {

    const isSmallThumb = imageClass === "small_thumbnail";
  
    //  SMALL THUMBNAIL MODE → ICON ONLY
    if (isSmallThumb) {
      return (
        <div
          className={`d-flex  align-items-center justify-content-center ${borderStyle_} ${imageClass}`}
          style={{
            width: "60px",   // match your image size
            height: "60px",
            borderRadius: "10px",
          }}
          onClick={() => window.open(finalMediaPath, "_blank")}
          title={magicTrimText(fileMeta.name)}
        >
          <i
            className={`fa ${getIcon(fileMeta.type)} cpointer`}
            style={{ fontSize: "22px" }}
          ></i>
        </div>
      );
    }
// 🧾 NORMAL MODE (HIGH VIBE UI)
return defaultSize ? (
  <div
    className="d-flex align-items-center justify-content-center cpointer"
    style={{
      height: "80px",
    }}
    title={magicTrimText(fileMeta.name)}
    onClick={() => window.open(finalMediaPath, "_blank")}
  >
    <i
      className={`fa ${getIcon(fileMeta.type)}`}
      style={{ fontSize: "42px", opacity: 0.85 }}
    ></i>
  </div>
) : (
  <a
    href={finalMediaPath}
    target="_blank"
    rel="noopener noreferrer"
    className="d-block text-center elforge_file_card_v1"
  >
    <div className="elforge_file_inner">
      
      {/* ICON */}
      <div className="elforge_file_icon">
        <i className={`fa ${getIcon(fileMeta.type)}`}></i>
      </div>

      {/* NAME */}
      <div className="elforge_file_name">
        {magicTrimText(fileMeta.name, 70, 70)}
      </div>

      {/* ACTION */}
      <div className="elforge_file_action">
        <i className="fa fa-download"></i> Download
      </div>

    </div>
  </a>
);
  }


  // 🔁 Safe fallback image
  if (forceImg && isMediaAvailable && isImage) {
    return (
      <img
        src={finalMediaPath}
        className={`cpointer ${borderStyle_} ${imageClass}`}
        alt="fallback"
      />
    );
  }

  // 🧱 Default
  return (
    <img
      src={defaultLogo}
      className={`cpointer ${borderStyle_} ${imageClass}`}
      alt="default"
    />
  );
}

export function mosyToCamelCase(str) {
  return str.replace(/_([a-z])/g, function (_, char) {
    return char.toUpperCase();
  });
}


export function SmartDropdown({ 
  apiEndpoint, 
  idField, 
  labelField, 
  inputName = 'smart_input',
  label = 'Select or type an option',
  onSelect,
  defaultValue = ''
}) {
  const [options, setOptions] = useState([]);
  const [selectedValue, setSelectedValue] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);

  const initialDefault = useRef(defaultValue); // 👈 Keeps default persistent

  const groupByField = mosyToCamelCase(labelField)

  // Fetch the option list once per endpoint. `defaultValue` deliberately
  // is NOT a dependency here — callers (GroupedSelectInput) bind it to the
  // live, keystroke-by-keystroke form value, so including it re-ran this
  // fetch on every keystroke: each response landed with the `defaultValue`
  // captured back when THAT fetch started and forced it into customInput,
  // stomping over whatever the user had typed since. Seeding from the
  // current value only happens once, below, via the initialDefault ref.
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch the  data with the given key
        const res = await mosyGetData({
          endpoint: apiEndpoint,
          params: {
          groupBy : btoa(`${groupByField}`),
          src : btoa(`${inputName}`)
          },
        });

        if (cancelled) return;

        const data = res
        if (data.status === 'success') {
          setOptions(data.data || []);
        } else {
          console.error('API Error:', data.message);
        }
      } catch (err) {
        if (!cancelled) console.error('Fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [apiEndpoint]);

  // Seed selectedValue/customInput from whatever value the field already
  // had ONCE, on mount — not on every re-render, so typing never gets
  // overwritten by this.
  useEffect(() => {
    const seed = initialDefault.current;
    if (seed) {
      setSelectedValue(seed);
      setCustomInput(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectChange = (e) => {
    const val = e.target.value;
    setIsCustom(false);
    setSelectedValue(val);
    setCustomInput(val);
    if (onSelect) onSelect(val);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setCustomInput(val);
    if (onSelect) onSelect(val);
  };


 const toggleCustomInput = () => {
    setIsCustom(prev => {
      const goingToDropdown = prev === true;
      if (goingToDropdown) {
        // Re-apply initial default only if they didn't select anything yet
        setSelectedValue(prevVal => prevVal || initialDefault.current);
      }
      return !prev;
    });
  };
  
  
  return (
    <>
      <label className="cpointer text-left">
        {label}
        <span className="pr-2">{' '}</span> | 
        {!isCustom ? (
          <span onClick={toggleCustomInput} className="text-primary ms-2 badge">
            <i className="ml-2 fa fa-plus"></i> Add new
          </span>
        ) : (
          <span onClick={toggleCustomInput} className="text-primary ms-2 badge">
            <i className="ml-2 fa fa-list"></i> Use options
          </span>
        )}
      </label>

      {!isCustom ? (
        <select
          className="form-control"
          name={inputName}
          value={selectedValue}
          onChange={handleSelectChange}
        >
        <option value="">
          {selectedValue ? selectedValue : `-- Select ${label}--`}
        </option>

        {options.map((item) => (

        <option
        key={
            item[idField]
            ||
            item[labelField]
        }
        value={item[labelField]}
        >

            {item[labelField]}

        </option>

        ))}

        </select>
      ) : (
        <input
          type="text"
          className="form-control mb-2"
          placeholder={`Type new  ${label}`}
          name={inputName}
          value={customInput}
          onChange={handleInputChange}
        />
      )}
    </>
  );
}

export function LiveSearchDropdown({
  apiEndpoint,
  tblName = 'q',
  parentTable ="p",
  inputName = 'live_search',
  hiddenInputName = 'selected_id',
  label = 'Search & select an option',
  onSelect,
  onSelectFull,
  displayField = 'name',
  valueField = 'id',
  defaultValue = null,
  onInputChange,
  defaultColSize="col-md-4",
  cellOverrides={},
  inputOverrides={},
  context={},
  labelClassName="",
  mosyFilterOptions={},
  customDisplay = ""}) {

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef(null);

  // ---- Portal positioning — ONLY thing added for the clipping fix ----
  // wrapRef reads the input's own box (getBoundingClientRect) so the
  // portaled <ul> can be positioned with `fixed` + those coordinates,
  // instead of relying on `position: absolute` relative to a parent that
  // may sit inside an overflow:auto/hidden ancestor (e.g. a modal body)
  // clipping it. Nothing else below this block changed.
  const wrapRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const rafRef = useRef(null);

  const recalcCoords = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    if (!isFocused) return;
    recalcCoords();

    // capture:true — scroll doesn't bubble, but a capture-phase listener
    // on window still sees scroll from any scrollable ancestor (e.g. a
    // modal body scrolling), not just window-level scroll.
    const onReposition = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recalcCoords();
      });
    };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isFocused]);
  // ---- end portal positioning block ----

  const formatCustomDisplay = (template, item) => {
    if (!template) return item[displayField] ?? '';
  
    return template.replace(/{{(.*?)}}/g, (_, key) => {
      return item[key.trim()] ?? '';
    });
  };

  console.log(`[LiveSearchDropdown] defaultValue ${JSON.stringify(defaultValue)} inputName ${inputName} displayField ${displayField} valueField ${valueField} ${tblName} parent ${parentTable}`);
  // Set default value on mount
  useEffect(() => {
    if (defaultValue && defaultValue[valueField]) {
      setSelected(defaultValue);
      setQuery(defaultValue[displayField]);
    }
  }, [defaultValue, valueField, displayField]);

  // Perform live search
  useEffect(() => {
    /*if (!query.trim() && !isFocused) {
      setResults([]);
      setHasSearched(false);
      return;
    }*/

    setLoading(true);
    setHasSearched(true);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const encodedQuery = btoa(query)
        
      const customParams = { [`q${tblName}`] : encodedQuery, ...mosyFilterOptions}
        
      const queryFilterStr = MosySecureFilterEngine(tblName, customParams)

      console.log(`queryFilterStr ${JSON.stringify(queryFilterStr)}`, queryFilterStr , mosyFilterOptions)
      try {
        
        // Fetch the  data with the given key
        const res = await mosyGetData({
          endpoint: apiEndpoint,
          params: { 
          ...queryFilterStr,    
          src : btoa(`${parentTable} - ${hiddenInputName}`)

          },
        });
        
        //console.log("LiveSearchDropdown res ", res)
        const data =res // await res.json();
        if (data.status === 'success') {
          setResults(data.data || []);
        } else {
          console.error('API error:', res);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    //console.log(`live search tbl ${tblName} isfocused ${isFocused} reslts ${results.length}  isloading ${loading} hasSearched ${hasSearched}`)
    return () => clearTimeout(debounceRef.current);
  }, [query, apiEndpoint, tblName]);


  const handleSelect = (item) => {
    const displayValue = item[displayField] ?? '';
    setSelected(item);
    setQuery(displayValue);
  
    if (onSelect) onSelect(item[valueField]);
    if (onSelectFull) onSelectFull(item);
  
    if (onInputChange) {
      // Hidden ID
      onInputChange({
        target: {
          name: hiddenInputName,
          value: item[valueField],
        },
      });
  
      // Display text (optional)
      onInputChange({
        target: {
          name: inputName,
          value: displayValue,
        },
      });
    }
  };
  
  

  // Handle typing
  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setSelected(null);
    if (onInputChange) onInputChange(e); // Notify the outside world!

  };

  const { activeIndex, handleKeyDown } = useDropdownNavigation(
    results,
    (item) => {
      onSelectFull(item);
    }
  );

  // Focus/blur handlers to control dropdown visibility
  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setTimeout(() => setIsFocused(false), 150);

  const cellClass = mosyCellClass(parentTable, hiddenInputName, context, cellOverrides);
  const inputProps = mosyInputProps(parentTable, hiddenInputName, context, inputOverrides);

  const createNewCellClass = mosyCellClass(parentTable, `${hiddenInputName}_create_new`, context, cellOverrides);

  // Same <ul> markup/handlers as before, byte-for-byte — only its
  // position/overflowY inline styles and its render TARGET changed
  // (portaled to document.body via createPortal instead of rendered as
  // a normal nested child), so it can no longer be clipped by an
  // overflow:auto/hidden ancestor like a modal's scrollable body.
  const dropdownMenu = isFocused && coords && typeof document !== 'undefined' && createPortal(
    <ul
      className="list-group shadow"
      style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, maxHeight: '220px', overflowY: 'auto', zIndex: 1119, background: '#fff', margin: 0 }}
      // Portaled content still bubbles mousedown up the REACT tree (this
      // is inside DynamicModal's React tree as modalProps.body), reaching
      // .modal's onMouseDown={handleOutsideClick} exactly as if it weren't
      // portaled — but that handler's `modalRef.current.contains(e.target)`
      // check uses the REAL DOM tree, where this <ul> now lives under
      // document.body, nowhere near .modal-content. Result: it reads as
      // an "outside click" and closes the whole modal on mousedown,
      // before the click ever reaches handleSelect below. stopPropagation
      // here keeps that mousedown from ever reaching the modal's handler,
      // without touching preventDefault (the existing handleBlur 150ms
      // grace period still does its job for native input blur).
      onMouseDown={(e) => e.stopPropagation()}
    >
      {loading && (
        <li className="list-group-item text-muted">
          <i className="fa fa-spinner fa-spin me-2"></i> Searching...
        </li>
      )}

      {!loading && results.length > 0 && results.map((item, idx) => (
        <li
          key={`${item[valueField]}=${magicRandomStr()}`}
          className={`list-group-item list-group-item-action ${
            idx === activeIndex ? "active text-white" : ""
          }`}
          onClick={() => handleSelect(item)}
          style={{ cursor: 'pointer' }}
        >
          {customDisplay 
            ? formatCustomDisplay(customDisplay, item)
            : item[displayField]
          }
        </li>
      ))}

      {!loading && results.length === 0 && hasSearched && (
        <li className="list-group-item text-muted p-2">
        <div className="d-flex justify-content-between align-items-center">
          <span className="d-flex align-items-center badge">
            <i className="fa fa-info-circle mr-2"></i> No results found
          </span>

          <u
            onClick={() => setIsFocused(false)}
            style={{ cursor: 'pointer' }}
            className="text-danger badge pr-2"
          >
            <i className="fa fa-times-circle me-1"></i> Close
          </u>
        </div>
      </li>
      )}

      {/* Always show Add New when focused */}
      <li
        className={`list-group-item list-group-item-action text-primary ${createNewCellClass} hide_livesearch_add_new`}
        style={{ cursor: 'pointer', fontWeight: 'bold' }}
        onClick={() => {
          setTimeout(() => setIsFocused(false), 50);
          MosyExtendLiveSearch({
            table: tblName,
            label,
            query,
            context,
            hiddenInputName,
            parentTable
          });
          setIsFocused(false);
        }}
      >
        <i className="fa fa-plus me-2 text-success"></i>
        <span className="badge">{'Add new'}</span>
      </li>
    </ul>,
    document.body
  );

  return (
                      
    <div className={`form-group ${defaultColSize} text-left  p-0 m-0 hive_data_cell ${cellClass}`}>
    <div className="col-md-12 p-0 m-0 " id="">          
    <div className="form-group position-relative p-0 m-0 " ref={wrapRef}>
      <label className={`${labelClassName} text-left`}>{label}</label>
      <input
        type="text"
        className="form-control"
        name={inputName}
        id={inputName}
        autoComplete="off"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={`Search ${label}...`}
        onKeyDown={handleKeyDown} 
        {...inputProps}
      />

      {dropdownMenu}


      {selected && (
        <input type="hidden" name={hiddenInputName} value={selected[valueField]} onChange={onInputChange} />
      )}
    </div>
    </div>
    </div>
  );
} 


// export function LiveSearchDropdown({
//   apiEndpoint,
//   tblName = 'q',
//   parentTable ="p",
//   inputName = 'live_search',
//   hiddenInputName = 'selected_id',
//   label = 'Search & select an option',
//   onSelect,
//   onSelectFull,
//   displayField = 'name',
//   valueField = 'id',
//   defaultValue = null,
//   onInputChange,
//   defaultColSize="col-md-4",
//   cellOverrides={},
//   inputOverrides={},
//   context={},
//   labelClassName="",
//   mosyFilterOptions={},
//   customDisplay = ""}) {

//   const [query, setQuery] = useState('');
//   const [results, setResults] = useState([]);
//   const [selected, setSelected] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [hasSearched, setHasSearched] = useState(false);
//   const [isFocused, setIsFocused] = useState(false);
//   const debounceRef = useRef(null);

//   const formatCustomDisplay = (template, item) => {
//     if (!template) return item[displayField] ?? '';
  
//     return template.replace(/{{(.*?)}}/g, (_, key) => {
//       return item[key.trim()] ?? '';
//     });
//   };

//   console.log(`[LiveSearchDropdown] defaultValue ${JSON.stringify(defaultValue)} inputName ${inputName} displayField ${displayField} valueField ${valueField} ${tblName} parent ${parentTable}`);
//   // Set default value on mount
//   useEffect(() => {
//     if (defaultValue && defaultValue[valueField]) {
//       setSelected(defaultValue);
//       setQuery(defaultValue[displayField]);
//     }
//   }, [defaultValue, valueField, displayField]);

//   // Perform live search
//   useEffect(() => {
//     /*if (!query.trim() && !isFocused) {
//       setResults([]);
//       setHasSearched(false);
//       return;
//     }*/

//     setLoading(true);
//     setHasSearched(true);

//     clearTimeout(debounceRef.current);
//     debounceRef.current = setTimeout(async () => {
//       const encodedQuery = btoa(query)
        
//       const customParams = { [`q${tblName}`] : encodedQuery, ...mosyFilterOptions}
        
//       const queryFilterStr = MosySecureFilterEngine(tblName, customParams)

//       console.log(`queryFilterStr ${JSON.stringify(queryFilterStr)}`, queryFilterStr , mosyFilterOptions)
//       try {
        
//         // Fetch the  data with the given key
//         const res = await mosyGetData({
//           endpoint: apiEndpoint,
//           params: { 
//           ...queryFilterStr,    
//           src : btoa(`${parentTable} - ${hiddenInputName}`)

//           },
//         });
        
//         //console.log("LiveSearchDropdown res ", res)
//         const data =res // await res.json();
//         if (data.status === 'success') {
//           setResults(data.data || []);
//         } else {
//           console.error('API error:', res);
//         }
//       } catch (err) {
//         console.error('Fetch error:', err);
//       } finally {
//         setLoading(false);
//       }
//     }, 400);

//     //console.log(`live search tbl ${tblName} isfocused ${isFocused} reslts ${results.length}  isloading ${loading} hasSearched ${hasSearched}`)
//     return () => clearTimeout(debounceRef.current);
//   }, [query, apiEndpoint, tblName]);


//   const handleSelect = (item) => {
//     const displayValue = item[displayField] ?? '';
//     setSelected(item);
//     setQuery(displayValue);
  
//     if (onSelect) onSelect(item[valueField]);
//     if (onSelectFull) onSelectFull(item);
  
//     if (onInputChange) {
//       // Hidden ID
//       onInputChange({
//         target: {
//           name: hiddenInputName,
//           value: item[valueField],
//         },
//       });
  
//       // Display text (optional)
//       onInputChange({
//         target: {
//           name: inputName,
//           value: displayValue,
//         },
//       });
//     }
//   };
  
  

//   // Handle typing
//   const handleInputChange = (e) => {
//     setQuery(e.target.value);
//     setSelected(null);
//     if (onInputChange) onInputChange(e); // Notify the outside world!

//   };

//   const { activeIndex, handleKeyDown } = useDropdownNavigation(
//     results,
//     (item) => {
//       onSelectFull(item);
//     }
//   );

//   // Focus/blur handlers to control dropdown visibility
//   const handleFocus = () => setIsFocused(true);
//   const handleBlur = () => setTimeout(() => setIsFocused(false), 150);

//   const cellClass = mosyCellClass(parentTable, hiddenInputName, context, cellOverrides);
//   const inputProps = mosyInputProps(parentTable, hiddenInputName, context, inputOverrides);

//   const createNewCellClass = mosyCellClass(parentTable, `${hiddenInputName}_create_new`, context, cellOverrides);

//   return (
                      
//     <div className={`form-group ${defaultColSize} text-left  p-0 m-0 hive_data_cell ${cellClass}`}>
//     <div className="col-md-12 p-0 m-0 " id="">          
//     <div className="form-group position-relative p-0 m-0 ">
//       <label className={`${labelClassName} text-left`}>{label}</label>
//       <input
//         type="text"
//         className="form-control"
//         name={inputName}
//         id={inputName}
//         autoComplete="off"
//         value={query}
//         onChange={handleInputChange}
//         onFocus={handleFocus}
//         onBlur={handleBlur}
//         placeholder={`Search ${label}...`}
//         onKeyDown={handleKeyDown} 
//         {...inputProps}
//       />

//         {isFocused && (
//           <ul
//             className="list-group position-absolute w-100 bg-white shadow"
//             style={{ maxHeight: '220px', overflowY: 'auto', zIndex: 1119 }}
//           >
//             {loading && (
//               <li className="list-group-item text-muted">
//                 <i className="fa fa-spinner fa-spin me-2"></i> Searching...
//               </li>
//             )}

//             {!loading && results.length > 0 && results.map((item, idx) => (
//               <li
//                 key={`${item[valueField]}=${magicRandomStr()}`}
//                 className={`list-group-item list-group-item-action ${
//                   idx === activeIndex ? "active text-white" : ""
//                 }`}
//                 onClick={() => handleSelect(item)}
//                 style={{ cursor: 'pointer' }}
//               >
//                 {customDisplay 
//                   ? formatCustomDisplay(customDisplay, item)
//                   : item[displayField]
//                 }
//               </li>
//             ))}

//             {!loading && results.length === 0 && hasSearched && (
//               <li className="list-group-item text-muted p-2">
//               <div className="d-flex justify-content-between align-items-center">
//                 <span className="d-flex align-items-center badge">
//                   <i className="fa fa-info-circle mr-2"></i> No results found
//                 </span>

//                 <u
//                   onClick={() => setIsFocused(false)}
//                   style={{ cursor: 'pointer' }}
//                   className="text-danger badge pr-2"
//                 >
//                   <i className="fa fa-times-circle me-1"></i> Close
//                 </u>
//               </div>
//             </li>
//             )}

//             {/* Always show Add New when focused */}
//             <li
//               className={`list-group-item list-group-item-action text-primary ${createNewCellClass} hide_livesearch_add_new`}
//               style={{ cursor: 'pointer', fontWeight: 'bold' }}
//               onClick={() => {
//                 setTimeout(() => setIsFocused(false), 50);
//                 MosyExtendLiveSearch({
//                   table: tblName,
//                   label,
//                   query,
//                   context,
//                   hiddenInputName,
//                   parentTable
//                 });
//                 setIsFocused(false);
//               }}
//             >
//               <i className="fa fa-plus me-2 text-success"></i>
//               <span className="badge">{'Add new'}</span>
//             </li>
//           </ul>
//         )}


//       {selected && (
//         <input type="hidden" name={hiddenInputName} value={selected[valueField]} onChange={onInputChange} />
//       )}
//     </div>
//     </div>
//     </div>
//   );
// }


export function MosySmartField({
  module,
  field,
  label,
  value = "",
  onChange = () => {},
  context = {},
  inputOverrides = {},
  cellOverrides = {},
  placeholder = "",
  type = "text", // can be 'text', 'textarea', 'email', 'password', etc.
  inputIdPrefix = "",
}) {
  const cellClass = mosyCellClass(module, field, context, cellOverrides);
  const inputProps = mosyInputProps(module, field, context, inputOverrides);
  const inputId = `${inputIdPrefix}${field}`;

  let finalValue = value;

  if (type === "date") {
    finalValue = mosyFormatDateOnly(value);
  }

  if (type === "datetime-local") {
    finalValue = mosyFormatDateTime(value);
  }

  return (
    <div className={`form-group hive_data_cell ${cellClass}`}>
      {label && (
        <label
          htmlFor={inputId}
          id={`label_${module}_${inputId}`}
          name={`label_${module}_${inputId}`}
        >
          {label}
        </label>
      )}

      {type === "textarea" ? (
        <textarea
          className="form-control mosy_text_area"
          id={inputId}
          name={inputId}
          value={finalValue}
          onChange={onChange}
          placeholder={placeholder || label}
          {...inputProps}
        />
      ) : (
        <>
          <input
            className="form-control"
            id={inputId}
            name={inputId}
            value={finalValue}
            onChange={onChange}
            placeholder={placeholder || label}
            type={type}
            {...inputProps}
          />
          {type === "password" && (
            <div className="form-check mt-2">
              <input
                type="checkbox"
                className="form-check-input"
                id={`show_${inputId}`}
                onChange={() => mosyTogglePassword(inputId)}
              />
              <label
                htmlFor={`show_${inputId}`}
                className="form-check-label text-muted"
                style={{ cursor: "pointer", fontSize: "0.9em" }}
              >
                Show Password
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MosySmartDataField({
  module,
  field,
  label,
  value = "",
  onChange = () => {},
  context = {},
  inputOverrides = {},
  cellOverrides = {},
  placeholder = "",
  type = "text", // can be 'text', 'textarea', 'email', 'password', etc.
  inputIdPrefix = "",
}) {
  const cellClass = mosyCellClass(module, field, context, cellOverrides);
  const inputProps = mosyInputProps(module, field, context, inputOverrides);
  const inputId = `${inputIdPrefix}${field}`;

  let finalValue = value;

  if (type === "date") {
    finalValue = mosyFormatDateOnly(value);
  }

  if (type === "datetime-local") {
    finalValue = mosyFormatDateTime(value);
  }

  return (
    <div className={`form-group hive_data_cell ${cellClass}`}>
      {label && (
        <label
          htmlFor={inputId}
          id={`label_${module}_${inputId}`}
          name={`label_${module}_${inputId}`}
        >
          {label}
        </label>
      )}

      {type === "textarea" ? (
        <textarea
          className="form-control mosy_text_area"
          id={inputId}
          name={inputId}
          defaultValue={finalValue}
          onChange={onChange}
          placeholder={placeholder || label}
          {...inputProps}
        />
      ) : (
        <>
          <input
            className="form-control"
            id={inputId}
            name={inputId}
            defaultValue={finalValue}
            onChange={onChange}
            placeholder={placeholder || label}
            type={type}
            {...inputProps}
          />
          {type === "password" && (
            <div className="form-check mt-2">
              <input
                type="checkbox"
                className="form-check-input"
                id={`show_${inputId}`}
                onChange={() => mosyTogglePassword(inputId)}
              />
              <label
                htmlFor={`show_${inputId}`}
                className="form-check-label text-muted"
                style={{ cursor: "pointer", fontSize: "0.9em" }}
              >
                Show Password
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}


/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

export function MosySelectField({

  label = "",
  name = "",
  value = "",
  options = [],
  onChange = null,
  colClass = "col-md-12"

}){

  const [selectedValue,setSelectedValue] =
      useState(value || "");

  /*
  |--------------------------------------------------------------------------
  | SYNC PARENT VALUE
  |--------------------------------------------------------------------------
  */

  useEffect(() => {

      setSelectedValue(
          value || ""
      );

  }, [value]);

  return (

      <div
      className={`form-group ${colClass} hive_data_cell`}
      >

          <label>

              {label}

          </label>

          <select
          name={name}
          id={name}
          className="form-control"

          value={selectedValue}

          onChange={(e) => {

              setSelectedValue(
                  e.target.value
              );

              if(onChange){

                  onChange(e);

              }

          }}
          >

              <option value="">

                  {`Select ${label}`}

              </option>

              {options.map(function(option,index){

                  /*
                  |--------------------------------------------------------------------------
                  | STRING MODE
                  |--------------------------------------------------------------------------
                  */

                  if(typeof option === "string"){

                      return (

                          <option
                          key={option}
                          value={option}
                          >

                              {option}

                          </option>

                      );

                  }

                  /*
                  |--------------------------------------------------------------------------
                  | OBJECT MODE
                  |--------------------------------------------------------------------------
                  */

                  return (

                      <option
                      key={option.value}
                      value={option.value}
                      >

                          {option.label}

                      </option>

                  );

              })}

          </select>

      </div>

  );

}


export function MosyPaginationUi({
  src="",
  tblName = "",
  totalPages = 0,
  onPageSwitch = () => {},
  onPageSizeChange = () => {},
  stateItemSetters={},
  pageSizeOptions = [2, 5, 10, 20, 50, 100, 250, 500, 1000, 5000, 10000000000]
}) {

  //console.log(`page setter incc`, stateItemSetters)
  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  
  useEffect(() => {
    const pageParam = searchParams.get(`q${tblName}_page`);
    if (pageParam) {
      const parsed = Number(pageParam);
      if (!isNaN(parsed)) {
        setCurrentPage(parsed);
      }
    }
  }, [searchParams, tblName]);

  const [currentPageSize, setCurrentPageSize] = useState(20); // default fallback

useEffect(() => {
  const savedSize = mosyGetLSData("systemDataLimit");
  if (savedSize) {
    setCurrentPageSize(savedSize);
  }
}, []);


  function onPageChange(nextPage) {
    mosyUpdateUrlParam(`q${tblName}_page`, nextPage);
    onPageSwitch(nextPage);
    stateItemSetters.setLocalEventSignature(magicRandomStr())
  }

  function handlePageSizeChange(e) {
    const newSize = parseInt(e.target.value);
    mosySetLSData("systemDataLimit", newSize)
    stateItemSetters.setLocalEventSignature(magicRandomStr())
    setCurrentPageSize(newSize)
    deleteUrlParam(`q${tblName}_page`)

    onPageSizeChange(newSize);
  }

  const renderPageNumbers = () => {
    const pageNumbersSet = new Set();
    const pageNumbers = [];
  
    const firstPages = [1, 2, 3, 4].filter(p => p <= totalPages);
    const lastPages = [totalPages - 3, totalPages - 2, totalPages - 1, totalPages].filter(p => p >= 1 && p > 4);
  
    // Collect first pages
    firstPages.forEach(p => pageNumbersSet.add(p));
  
    // Collect previous 2 pages
    [2, 1].forEach(offset => {
      const page = currentPage - offset;
      if (page > 0 && page <= totalPages) {
        pageNumbersSet.add(page);
      }
    });
  
    // Current page
    if (currentPage > 0 && currentPage <= totalPages) {
      pageNumbersSet.add(currentPage);
    }
  
    // Next 2 pages
    [1, 2].forEach(offset => {
      const page = currentPage + offset;
      if (page > 0 && page <= totalPages) {
        pageNumbersSet.add(page);
      }
    });
  
    // Collect last pages
    lastPages.forEach(p => pageNumbersSet.add(p));
  
    // Sort all numbers
    const sortedNumbers = Array.from(pageNumbersSet).sort((a, b) => a - b);
  
    // Insert ellipses for gaps
    for (let i = 0; i < sortedNumbers.length; i++) {
      const current = sortedNumbers[i];
      const prev = sortedNumbers[i - 1];
      if (i > 0 && current - prev > 1) {
        pageNumbers.push("...");
      }
      pageNumbers.push(current);
    }
  
    // Render logic
    return pageNumbers.map((item, index) => {
      if (item === "...") {
        return (
          <li key={`ellipsis-${index}`} className="page-item disabled">
            <span className="page-link">...</span>
          </li>
        );
      }
  
      return (
        <li key={item} className={`page-item ${item === currentPage ? 'active' : ''}`}>
          <button type="button" className="page-link" onClick={() => onPageChange(item)}>
            {item}
          </button>
        </li>
      );
    });
  };
  
  const billingStatus = useBillingAccountStatus();
  //  Don't render buttons if billing is not active
  if (billingStatus !== "Active") {
    return 
  }
  
  //if(isComponentEnabled(src, "paginate"))

  return (
    <div className="mt-4 mb-3 row justify-content-center col-md-12 m-0 p-0 border-top border_set pt-2">
      <nav aria-label="Page navigation" className="col-md-8">
        <div className="row justify-content-center">
          <div className="pagination-wrapper w-100">
            <ul className="pagination justify-content-center flex-nowrap" style={{ minWidth: 'max-content' }}>

              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => onPageChange(1)}>First</button>
              </li>
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => onPageChange(currentPage - 1)}>Prev</button>
              </li>

              {renderPageNumbers()}

              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => onPageChange(currentPage + 1)}>Next</button>
              </li>
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => onPageChange(totalPages)}>Last</button>
              </li>

            </ul>
          </div>
        </div>
      </nav>

      <div className="col-md-4 p-2">
      <label className="badge">{currentPageSize === 10000000000 ? 'Showing All rows' : `Show ${currentPageSize} rows per page`} | Change</label>
      <select className="rows_per_record" value={currentPageSize} onChange={handlePageSizeChange}>
        {pageSizeOptions.map(size => (
            <option key={size} value={size}>
              {size === 10000000000 ? 'Show All' : `${size}`}
            </option>
          ))}

        </select>
      </div>
    </div>
  );
}


export function MosyDateInputComponent({
  label = "Select Date",
  value,
  onChange,
  name = "date",
  required = false,
  defaultDate = new Date().toISOString().split("T")[0],
}) {
  const handleChange = (e) => {
    onChange(e.target.value);
  };

  let sanitizedDate = mosyFormatDateOnly(value) //value ? new Date(value).toISOString().split("T")[0] : defaultDate;
  
  return (
    <>
      <input
        type="date"
        className="form-control"
        name={name}
        id={name}
        value={sanitizedDate}
        onChange={handleChange}
        required={required}
      />
    </>
  );
}



export function MosyDateTimeInputComponent({
  value,
  onChange,
  name = "datetime",
  required = false,
  defaultDate = new Date().toISOString().slice(0, 16), // Default to current date and time
}) {
  const handleChange = (e) => {
    onChange(e.target.value); // Send updated date/time to the parent component
  };

  // Ensure the `value` is in the correct format (YYYY-MM-DDTHH:MM)
  const formattedValue = value || defaultDate;

  return (
    <>
      <input
        type="datetime-local"
        className="form-control"
        name={name}
        value={formattedValue} // Use formatted value
        onChange={handleChange}
        required={required}
      />
    </>
  );
}

export function MosyConfirm({
  icon = "warning",
  iconColor = "text-danger",
  message = "Are you sure?",
  yesLabel = "Yes",
  noLabel = "Cancel",
  onYes = () => {},
  onNo = () => {}
}) {
  MosyCard(
    <div className="text-center">
      <i className={`fa fa-${icon} ${iconColor} display-4`}></i>
      <p className="mt-3">{message}</p>
    </div>,

    <div className="text-center mt-4">
      <button className="btn btn-danger mx-2" onClick={() => { onYes(); closeMosyCard(); }}>
        {yesLabel}
      </button>
      <button className="btn btn-secondary mx-2" onClick={() => { onNo(); closeMosyCard(); }}>
        {noLabel}
      </button>
    </div>
  );
}


export function MosyTitleTag({ title = '' }) {
  return (
    <div className="elforge_mosy_titletag col-md-12 p-2 mt-4 mb-4 ">
      <h4 className="text-gray-800 text-lg font-semibold mb-2">{title}</h4>
      <div className="bg-dark" style={{ height: '1px' }}></div>
    </div>
  );
}


export function MosySpace({ spaceClass = '', ...rest }) {
  return <div className={`elforge_mosy_space ${spaceClass}`} {...rest}></div>;
}

export function MosyRangeSlider({
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 50,
  onSlide,
  inputName = 'Adjust',
  showValue = true,
  className = '',
}) {
  const [value, setValue] = useState(defaultValue);

  const handleChange = (e) => {
    const val = Number(e.target.value);
    setValue(val);
    if (onSlide) onSlide(val);
  };

  return (
    <div className={`mosy_range_slider ${className}`}>
      <input
        id={inputName}
        name={inputName}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="border border_set form-control"
      />
      {showValue && <span className="ml-2 font-mono">{value}</span>}
    </div>
  );
}


export function MosyActionButton({
  source = "",
  action="",
  label,
  icon,
  onClick,
  className = ''
}) {

  // master override
  const forceShowAll = true;

  // only show these when forceShowAll = false
  const sourceVisibilityWhitelist = [
    "Connect_client_action_btn",
    "Approve_payment_action_btn",
    "Delete_asset_action_btn",
  ];

  // always hide these
  const sourceVisibilityBlacklist = [
    "_view_acc_renewalsprofile_action_btn",
    "Hidden_admin_action_btn",
  ];

  // blacklist always wins
  if (
    sourceVisibilityBlacklist.includes(action)
  ) {
    return null;
  }

  // whitelist engine
  if (
    !forceShowAll &&
    !sourceVisibilityWhitelist.includes(action)
  ) {
    return null;
  }

  return (
    <a
      className={`medium_btn border border_set btn-white ml-1 mr-1 d-inline-block cpointer ${className}`}
      onClick={onClick}
    >
      {
        icon &&
        <i className={`fa fa-${icon} mr-1`}></i>
      }

      {label}
    </a>
  );
}


export function MosyDateRangeFilter({
  callBack = () => {},
  className = "",
  inputType = "date" // "date" OR "datetime-local"
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Formatters
  function formatDate(date) {
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  function formatDateTimeLocal(date) {
    const pad = (n) => n.toString().padStart(2, "0");
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes())
    ); // YYYY-MM-DDTHH:MM
  }

  useEffect(() => {
    const now = new Date();

    if (inputType === "datetime-local") {
      const formatted = formatDateTimeLocal(now);
      setStartDate(formatted);
      setEndDate(formatted);
    } else {
      const today = formatDate(now);
      setStartDate(today);
      setEndDate(today);
    }
  }, [inputType]);

  const handleProceed = () => {
    callBack({
      startDate,
      endDate,
    });
  };

  return (
    <div className={`row m-0 p-0 justify-content-center col-md-12 ${className}`}>
      
      <div className="form-group hive_data_cell col-md-6 text-left">
        <label>{inputType === "datetime-local" ? "Start date & time" : "Start date"}</label>
        <input
          type={inputType}
          className="form-control col-md-12 mr-2"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="form-group hive_data_cell col-md-6 text-left">
        <label>{inputType === "datetime-local" ? "End date & time" : "End date"}</label>
        <input
          type={inputType}
          className="form-control col-md-12 mr-2"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div className="row m-0 p-0 justify-content-end col-md-12">
        <button
          className="btn border border_set btn-primary cpointer mb-2 mr-3"
          onClick={handleProceed}
        >
          <i className="fa fa-filter mr-1"></i> Proceed
        </button>
      </div>

    </div>
  );
}



export function filterDataByDate({
  label = "Search by date",
  inputType="date",
  callBack = () => {},
} = {}) {
  MosyCard(
    "",
    <>
      <div className="col-md-12 text-left m-0 pt-2 pl-0 pr-0 pb-2">
        <span className="m-0 p-0 h4">{label}</span>
      </div>
      <MosySpace spaceClass="p-1" />
      <MosyDateRangeFilter callBack={callBack} inputType={inputType}/>
    </>
  );
}

export function getStringInitials(name) {

  if (!name) return "";
  
  var words = name.trim().split(/\s+/);
  
  if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
  }
  
  var first = words[0].charAt(0);
  var second = words[1].charAt(0);
  
  return (first + second).toUpperCase();
  
  }


