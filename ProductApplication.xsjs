//import the corresponding lib
var inputReader 	= $.import("basf.bws.xs.lib", "InputReader");
var applyFilter 	= $.import("basf.bws.xs.lib", "ApplyFilter");
var util 			= $.import("basf.bws.xs.lib", "Util");
var settings 		= $.import("basf.bws.xs.lib", "Settings");

function getProductApplication(input, conn) {
	var procedure = null;
	var context = null;
	var parent = null;
 
	var numberNodes = 0;
	var productID = null;
	var categoryProductID = null;
	var productFamilyID = null;
	var numberNodesNoTarget = 0; // OSS 169001 / 2016
	
	var areasubparameter = null;
	var targetTaxonomyType = null;
 

	var filterContextNoTarget = null;
	var path = 'basf.bws.db.pub.nav.proc.product_application'
    
    path = applyFilter.getProcedurePath('ProductApplication',conn)

	switch (input.order.toLowerCase()) {
	case settings.productApplication.order.desc:
		procedure = conn.loadProcedure("BASF", path + "::PR_PRODUCT_APPLICATION_DESC" );
		break;
	case settings.productApplication.order.asc:
		procedure = conn.loadProcedure("BASF", path + "::PR_PRODUCT_APPLICATION_ASC" );
		break;
	default:
		procedure = conn.loadProcedure("BASF", path + "::PR_PRODUCT_APPLICATION_PRIO");
		break;
	}

	// set context without target taxonomy
	filterContextNoTarget = applyFilter.prepareTaxonomyNodeIDIncludeAll(input.context, settings.productApplication.taxonomy.availability);

	numberNodes = util.getNumberNodes(input);
	numberNodesNoTarget = numberNodes;  // OSS 169001 / 2016

	//check if target taxonomy exists
	if (input.hasOwnProperty("targetTaxonomy")) {
		if (input.targetTaxonomy.hasOwnProperty("taxonomyNodes")) {
			input.context.push(input.targetTaxonomy);
			context = applyFilter.prepareTaxonomyNodeIDIncludeOne(input.context, settings.productApplication.taxonomy.availability);
		}
		else {
			context = applyFilter.prepareTaxonomyNodeIDAndTypeLevel3(input.context, input.targetTaxonomy.taxonomyType);
		}
		targetTaxonomyType= input.targetTaxonomy.taxonomyType;
	} else {
		numberNodes++;
		context = applyFilter.prepareTaxonomyNodeIDAndTypeLevel1(input.context, settings.productApplication.applicationTaxonomy);
		targetTaxonomyType="1=0";
	}

	//check if industry taxonomy exists
	if (!applyFilter.hasTaxonomyType(input.context, settings.productApplication.industryTaxonomy)) {
		numberNodes++;
		context += " OR (TAXONOMY_TYPE_ID = " + applyFilter.setString(settings.productApplication.industryTaxonomy) + " AND LEVEL = 1)";
	}

	parent = applyFilter.prepareTaxonomyNodeIDIncludeAll(input.context, settings.productApplication.taxonomy.availability);

	// check if category product exists
	if (input.hasOwnProperty("categoryProductID")) {
		categoryProductID = applyFilter.prepareCategoryProductFilter(input);
		productID = "1=2";
		productFamilyID = "1=2";
	} else if (input.hasOwnProperty("productFamilyID")) {
			categoryProductID = "1=2";
		    productID = "1=2";
		    productFamilyID = applyFilter.prepareProductFamilyFilterWhereUsed(input);
	} else
	    {
		categoryProductID = "1=2";
		productFamilyID = "1=2";
		productID = applyFilter.prepareProductFilter(input);	       	     
	    }
	

	//BWS 2460
	if(input.hasOwnProperty("areasubparameter")) {
	    if (input.areasubparameter == '') {
	        areasubparameter = 'newtp';
	    }
	    else {
	        areasubparameter = input.areasubparameter;
	    }
	}
	else {
	    areasubparameter = 'newtp';    
	}
	
	
	return procedure(
		context,
		parent,
		numberNodes,
		filterContextNoTarget,
		input.hasOwnProperty("targetTaxonomy") ? numberNodesNoTarget - 1 : numberNodesNoTarget, // // OSS 169001 / 2016 (numbderNodes changes to numberNodesNoTarget// minus one if target taxonomy exists
		categoryProductID,
		productID,
		productFamilyID,
		input.userLanguage,
		input.pageEnvironment.toLowerCase() === settings.productApplication.env.draft ? 0 : 1,
		input.hasOwnProperty("userID") ? input.userID : "",
		input.pagingSize, 
		input.pagingSize * (input.pagingStep - 1),
		settings.productApplication.taxonomy.availability,
		areasubparameter,
		targetTaxonomyType
	);
}

/*
 * @param input: JSON document used as input. 
 * @returns (JSON document containing the result of the procedure Descendant Step. 
 */
function callProcedure(input) {
	var conn = null;
	var rs = null;
	var iter = null;
	var row = null;

	var pageResult = [];
	var pageRestulSize = 0;
	var narrowDownFilterResult = [];
	var narrowDownParents = [];

	try {
		conn = $.hdb.getConnection({"sqlcc" : "basf.bws.xs.nav::anonuser"});
		
		applyFilter.prepareCanBuyArticle(input,conn);

		rs = getProductApplication(input, conn);

		iter = rs.ot_prd.getIterator();
		while (iter.next()) {
			row = iter.value();
			pageResult.push({
				pageID 			: row.WEB_PAGE_ID,
				environment 	: row.ENVIRONMENT === 1 ? settings.productApplication.env.live : settings.productApplication.env.draft, 
				userLanguage 	: row.LANGUAGE_ID,
				pageType 		: row.PAGE_TYPE,
				template 		: row.TEMPLATE,
				title 			: row.NAME,
				description 	: row.DESCRIPTION,
				pageUrl 		: row.URL,
				pagePath 		: row.PATH,
				imagePath 		: row.IMAGE_IDENTIFIER,
				imageUrl 		: row.IMAGE_URL,
				shortUrl 		: row.SHORT_URL,
				contentType 	: row.CONTENT_TYPE,
				type 			: row.TYPE,
				ranking 		: parseInt(row.PRIORITY, 10)
			});
		}

		iter = rs.ot_narrow_down.getIterator();
		while (iter.next()) {
			row = iter.value();
			narrowDownFilterResult.push({
				nodeID 		: row.TAXONOMY_NODE_ID,
				typeID 		: row.TAXONOMY_TYPE_ID,
				nodeName 	: row.TAXONOMY_NODE_NAME,
				typeName 	: row.TAXONOMY_TYPE_NAME
			});
		}

		//next expected result set is the narrow down parents
		iter = rs.ot_parents.getIterator();
		while (iter.next()){
			row = iter.value();
			narrowDownParents.push({
				nodeID:		row.TAXONOMY_NODE_ID,
				typeID:		row.TAXONOMY_TYPE_ID,
				nodeName: 	row.TAXONOMY_NODE_NAME,
				typeName:	row.TAXONOMY_TYPE_NAME,
				level:		row.LEVEL
			});
		}

		pageRestulSize = rs.ot_result_size[0].RESULT_SIZE;
	} catch (e) {
		$.trace.error(e.toString());
		conn.rollback();

	} finally {
		conn.close();
	}

	return {
		result 				: pageResult,
		resultNarrowDown 	: util.groupByTaxonomyID(narrowDownFilterResult, narrowDownParents),
		resultSize 			: pageRestulSize
	};
}

//call procedure
var result = callProcedure(inputReader.getInput());

//send response
$.response.contentType = "application/json";
$.response.setBody(JSON.stringify(result));
